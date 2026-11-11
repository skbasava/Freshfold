import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { InternalContext } from "../../packages/contracts/src/auth";
import type { ApplyChangeInput } from "../../packages/contracts/src/mutations";
import { orderDetailSchema } from "../../packages/contracts/src/orders";
import { applyChange } from "../../workers/laundry/src/orders/apply-change";
import { getOrder } from "../../workers/laundry/src/orders/read";
import { dispatchOutboxBatch } from "../../workers/laundry/src/outbox/dispatch";
import type { CalendarEventApi } from "../../workers/calendar/src/consumer";
import { processCalendarMessage } from "../../workers/calendar/src/consumer";
import { deterministicEventId } from "../../workers/calendar/src/projection";
import { runCalendarReconciliation } from "../../workers/calendar/src/reconciliation";
import { sweepOutbox } from "../../workers/scheduler/src/sweeper";
import {
  processNotificationMessage,
  type NotificationConsumerEnv,
} from "../../workers/notifications/src/consumer";
import { ProviderSendError } from "../../packages/notification-client/src/index";
import { createOfflineOrder } from "../../apps/web/src/orders/offline";
import { createMutationQueue } from "../../apps/web/src/sync/mutation-queue";
import {
  createHttpMutationTransport,
  createReconnectFlush,
  type FlushSummary,
} from "../../apps/web/src/sync/submit";
import { isServerConfirmed } from "../../apps/web/src/sync/types";
import { createMemoryBackend } from "../helpers/memory-storage";
import {
  CALENDAR_NOW,
  createCalendarHarness,
} from "../helpers/calendar-integration";
import {
  TEST_HUB,
  TEST_TENANT,
  clearLaundryData,
  seedLaundryReadFixtures,
} from "../helpers/laundry-db";
import {
  FakeGoogleCalendar,
  type FakeCalendarEvent,
} from "../fakes/google-calendar";
import { FakeNotificationProvider } from "../fakes/notification-provider";
import {
  SCENARIO_NOW,
  SLOT_A_START,
  SLOT_B_START,
  SLOT_C_START,
  SLOT_D_START,
  TEST_CALENDAR_ID,
  TEST_SECRET,
  TEST_SERVICE_TOKEN,
  createFakeQueue,
  db,
  fakeMessage,
  findOutbox,
  laundryBinding,
  managerRequest,
  seedSlot,
  testEnv,
  toQueueMessage,
  type OutboxRow,
} from "../helpers/e2e";

const manager: InternalContext = {
  actorId: "manager-1",
  actorType: "user",
  role: "manager",
  tenantId: TEST_TENANT,
  hubId: TEST_HUB,
  exp: SCENARIO_NOW + 60_000,
};

function createInput(
  orderId: string,
  slotId: string,
  mutationId = `mutation:${orderId}`,
): Extract<ApplyChangeInput, { intent: "createOrder" }> {
  return {
    orderId,
    intent: "createOrder",
    payload: {
      customerId: "cust-1",
      serviceType: "wash_fold",
      deliverySlotId: slotId,
      items: [{ description: "Shirt", quantity: 1 }],
    },
    baseVersion: null,
    mutationId,
  };
}

function calendarEnv(calendar: FakeGoogleCalendar): {
  LAUNDRY: Fetcher;
  SERVICE_TOKEN: string;
  GOOGLE_CALENDAR_ID: string;
  googleCalendar: CalendarEventApi;
  now: () => number;
} {
  return {
    LAUNDRY: laundryBinding(),
    SERVICE_TOKEN: TEST_SERVICE_TOKEN,
    GOOGLE_CALENDAR_ID: TEST_CALENDAR_ID,
    googleCalendar: calendar as unknown as CalendarEventApi,
    now: () => CALENDAR_NOW,
  };
}

function notificationEnv(
  provider: FakeNotificationProvider,
  options: { delaySeconds?: number; now?: number } = {},
): NotificationConsumerEnv {
  return {
    LAUNDRY: laundryBinding(),
    SERVICE_TOKEN: TEST_SERVICE_TOKEN,
    NOTIFICATION_CHANNEL: "whatsapp",
    NOTIFICATION_DELAY_SECONDS: String(options.delaySeconds ?? 0),
    notificationProvider: provider,
    now: () => options.now ?? Date.now(),
  };
}

async function seedMissingProjection(
  harness: ReturnType<typeof createCalendarHarness>,
  orderId: string,
  version: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO calendar_sync
        (order_id, hub_id, calendar_id, event_id, etag, synced_version,
         sync_status, last_error, last_projected_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, 'synced', NULL, ?, ?)`,
    )
    .bind(
      orderId,
      TEST_HUB,
      harness.calendarId,
      deterministicEventId(orderId),
      version,
      CALENDAR_NOW,
      CALENDAR_NOW,
    )
    .run();
}

async function reconcile(
  harness: ReturnType<typeof createCalendarHarness>,
  calendar: FakeGoogleCalendar,
) {
  return runCalendarReconciliation({
    laundry: harness.laundryClient(),
    calendar: harness.calendarApi(calendar),
    calendarId: harness.calendarId,
    hubId: harness.hubId,
    now: harness.now,
  });
}

function requireRow(row: OutboxRow | null): OutboxRow {
  if (!row) {
    throw new Error("expected outbox row");
  }
  return row;
}

async function readOrder(orderId: string) {
  return getOrder(db, TEST_HUB, orderId);
}

async function countRows(sql: string, ...bindings: Array<string | number>) {
  const row = await db
    .prepare(sql)
    .bind(...bindings)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

class CountingCalendar extends FakeGoogleCalendar {
  patchCalls = 0;

  override async patch(
    id: string,
    patch: Partial<Omit<FakeCalendarEvent, "id" | "etag">>,
    options: { etag?: string } = {},
  ): Promise<FakeCalendarEvent> {
    this.patchCalls += 1;
    return super.patch(id, patch, options);
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
  await seedSlot("slot-a", SLOT_A_START, 2);
  await seedSlot("slot-b", SLOT_B_START, 2);
  await seedSlot("slot-c", SLOT_C_START, 1);
  await seedSlot("slot-d", SLOT_D_START, 2);
});

describe("T-110 end-to-end scenarios", () => {
  it("1. offline create reconnects and receives the canonical D1 order", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    const created = await createOfflineOrder(queue, {
      hubId: TEST_HUB,
      customerId: "cust-1",
      customerName: "Alice",
      customerPhone: "+919000000001",
      serviceType: "wash_fold",
      deliverySlotId: "slot-a",
      deliveryAt: SLOT_A_START,
      items: [{ description: "Shirt", quantity: 2 }],
      orderId: "order-offline",
      now: SCENARIO_NOW,
    });

    expect(isServerConfirmed(created.order)).toBe(false);

    const transport = createHttpMutationTransport({
      fetchImpl: async (path, init) =>
        managerRequest(path, init as RequestInit),
    });
    let summary: FlushSummary | undefined;
    const online = new EventTarget();
    const reconnect = createReconnectFlush({
      queue,
      transport,
      target: online,
      onResult: (result) => {
        summary = result;
      },
    });
    online.dispatchEvent(new Event("online"));
    await reconnect.idle();
    reconnect.dispose();

    expect(summary).toMatchObject({ attempted: 1, synced: 1, rejected: 0 });
    expect(isServerConfirmed((await queue.getOrder("order-offline"))!)).toBe(
      true,
    );

    const response = await managerRequest("/api/orders/order-offline");
    expect(response.status).toBe(200);
    const canonical = orderDetailSchema.parse(await response.json());
    expect(canonical).toMatchObject({
      id: "order-offline",
      hubId: TEST_HUB,
      status: "confirmed",
      version: 1,
      deliverySlotId: "slot-a",
      deliveryAt: SLOT_A_START,
    });
    expect(canonical.items).toHaveLength(1);
    expect(await queue.getOrder("order-offline")).toMatchObject({
      syncState: "synced",
      version: canonical.version,
      deliverySlotId: canonical.deliverySlotId,
    });
  });

  it("2. order creation produces exactly one Calendar event", async () => {
    await applyChange(db, manager, createInput("order-calendar", "slot-a"), {
      now: SCENARIO_NOW,
    });
    const calendarQueue = createFakeQueue();
    const notifyQueue = createFakeQueue();

    const dispatched = await dispatchOutboxBatch(
      db,
      {
        CALENDAR_QUEUE: calendarQueue as never,
        NOTIFY_QUEUE: notifyQueue as never,
      },
      { now: SCENARIO_NOW },
    );

    expect(dispatched).toEqual({ claimed: 2, sent: 2, failed: 0 });
    expect(calendarQueue.sent).toHaveLength(1);

    const calendar = new FakeGoogleCalendar();
    const message = fakeMessage(calendarQueue.sent[0]);
    await processCalendarMessage(message, calendarEnv(calendar));

    expect(message.ackCount).toBe(1);
    expect(message.retryCount).toBe(0);
    const events = await calendar.list();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: deterministicEventId("order-calendar"),
      extendedProperties: {
        private: { orderId: "order-calendar", projectedVersion: "1" },
      },
    });
    expect(
      await countRows(
        "SELECT COUNT(*) AS n FROM calendar_sync WHERE order_id = ? AND hub_id = ?",
        "order-calendar",
        TEST_HUB,
      ),
    ).toBe(1);
  });

  it("3. a manager move reschedules the order in D1", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    const projected = await harness.projectedOrder("order-1", calendar);
    await harness.moveEvent(calendar, projected.event, SLOT_B_START);

    const result = await harness.poll(calendar);

    expect(result.rescheduled).toBe(1);
    const order = await readOrder("order-1");
    expect(order).toMatchObject({
      version: 2,
      deliverySlotId: "slot-b",
      deliveryAt: SLOT_B_START,
    });
    const event = await db
      .prepare(
        `SELECT source, actor_type, actor_id FROM order_events
         WHERE order_id = 'order-1' AND new_version = 2`,
      )
      .first<{ source: string; actor_type: string; actor_id: string }>();
    expect(event).toEqual({
      source: "calendar",
      actor_type: "system",
      actor_id: "system:calendar",
    });
  });

  it("4. a forbidden Calendar edit is reverted", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    const projected = await harness.projectedOrder("order-1", calendar);
    await calendar.patch(projected.event.id, {
      summary: "Manager title",
    } as never);

    const result = await harness.poll(calendar);

    expect(result.reverts).toBe(1);
    expect((await calendar.get(projected.event.id))?.summary).toBe(
      projected.event.summary,
    );
    expect((await readOrder("order-1"))?.version).toBe(1);
    expect(await harness.repairCount()).toBe(1);
  });

  it("5. a failed enqueue is recovered by the Cron sweeper", async () => {
    await applyChange(db, manager, createInput("order-sweep", "slot-a"), {
      now: SCENARIO_NOW,
    });
    const calendarQueue = createFakeQueue();
    const notifyQueue = createFakeQueue();
    const authNow = Date.now();
    const failedAt = authNow - 60_000;

    calendarQueue.failNext = true;
    const first = await dispatchOutboxBatch(
      db,
      {
        CALENDAR_QUEUE: calendarQueue as never,
        NOTIFY_QUEUE: notifyQueue as never,
      },
      { now: failedAt },
    );

    expect(first).toEqual({ claimed: 2, sent: 1, failed: 1 });
    const failedRow = requireRow(
      await findOutbox({ orderId: "order-sweep", destination: "calendar" }),
    );
    expect(failedRow).toMatchObject({
      status: "pending",
      last_error: "queue_unavailable",
    });
    expect(calendarQueue.sent).toHaveLength(0);

    const sweep = await sweepOutbox(
      {
        LAUNDRY: laundryBinding({
          queues: {
            CALENDAR_QUEUE: calendarQueue,
            NOTIFY_QUEUE: notifyQueue,
          },
        }),
        INTERNAL_CONTEXT_SECRET: TEST_SECRET,
      },
      { now: authNow, limit: 10 },
    );

    expect(sweep).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(calendarQueue.sent).toHaveLength(1);
    expect(calendarQueue.sent[0]).toMatchObject({
      orderId: "order-sweep",
      destination: "calendar",
      targetVersion: 1,
    });
    expect(
      await findOutbox({ orderId: "order-sweep", destination: "calendar" }),
    ).toMatchObject({ status: "done", last_error: null });
  });

  it("6. a duplicate Queue message does not create a duplicate Calendar event", async () => {
    await applyChange(db, manager, createInput("order-duplicate", "slot-a"), {
      now: SCENARIO_NOW,
    });
    const row = requireRow(
      await findOutbox({ orderId: "order-duplicate", destination: "calendar" }),
    );
    const calendar = new FakeGoogleCalendar();
    const first = fakeMessage(toQueueMessage(row));
    const second = fakeMessage(toQueueMessage(row));

    await processCalendarMessage(first, calendarEnv(calendar));
    await processCalendarMessage(second, calendarEnv(calendar));

    expect(first.ackCount).toBe(1);
    expect(second.ackCount).toBe(1);
    expect(first.retryCount).toBe(0);
    expect(second.retryCount).toBe(0);
    expect(await calendar.list()).toHaveLength(1);
    expect(
      await countRows(
        "SELECT COUNT(*) AS n FROM calendar_sync WHERE order_id = ? AND hub_id = ?",
        "order-duplicate",
        TEST_HUB,
      ),
    ).toBe(1);
  });

  it("7. a delayed notification is suppressed after the manager drags an event back", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    const projected = await harness.projectedOrder("order-1", calendar);

    await harness.moveEvent(calendar, projected.event, SLOT_B_START);
    const movedOut = await harness.poll(calendar);
    expect(movedOut.rescheduled).toBe(1);

    const forwardProjection = requireRow(
      await findOutbox({
        orderId: "order-1",
        destination: "calendar",
        targetVersion: 2,
      }),
    );
    const projectionMessage = fakeMessage(toQueueMessage(forwardProjection));
    await processCalendarMessage(projectionMessage, {
      LAUNDRY: harness.laundryBinding(),
      SERVICE_TOKEN: TEST_SERVICE_TOKEN,
      GOOGLE_CALENDAR_ID: harness.calendarId,
      googleCalendar: harness.calendarApi(calendar),
      now: () => harness.now,
    });
    expect(projectionMessage.ackCount).toBe(1);

    await harness.moveEvent(calendar, projected.event, SLOT_A_START);
    const draggedBack = await harness.poll(calendar);
    expect(draggedBack.rescheduled).toBe(1);
    expect(await readOrder("order-1")).toMatchObject({
      version: 3,
      deliverySlotId: "slot-a",
      deliveryAt: SLOT_A_START,
    });

    const delayedRow = requireRow(
      await findOutbox({
        orderId: "order-1",
        destination: "notification",
        targetVersion: 2,
      }),
    );
    const provider = new FakeNotificationProvider();
    const delayedMessage = fakeMessage(toQueueMessage(delayedRow));
    await processNotificationMessage(
      delayedMessage,
      notificationEnv(provider, { delaySeconds: 300 }),
    );

    expect(delayedMessage.ackCount).toBe(1);
    expect(delayedMessage.retryCount).toBe(0);
    expect(provider.sent).toEqual([]);
    const ledger = await db
      .prepare(
        `SELECT state, last_error FROM notifications
         WHERE hub_id = ? AND idempotency_key = ?`,
      )
      .bind(TEST_HUB, "notification:hub-1:order-1:2")
      .first<{ state: string; last_error: string | null }>();
    expect(ledger).toEqual({ state: "suppressed", last_error: "superseded" });
    expect(
      await findOutbox({
        orderId: "order-1",
        destination: "notification",
        targetVersion: 2,
      }),
    ).toMatchObject({ status: "done" });
  });

  it("8. a provider timeout is recorded without claiming exactly-once delivery", async () => {
    await applyChange(db, manager, createInput("order-timeout", "slot-a"), {
      now: SCENARIO_NOW,
    });
    const row = requireRow(
      await findOutbox({
        orderId: "order-timeout",
        destination: "notification",
        targetVersion: 1,
      }),
    );
    const provider = new FakeNotificationProvider();
    provider.nextError = new ProviderSendError("timeout", "provider_timeout");
    const message = fakeMessage(toQueueMessage(row));

    await processNotificationMessage(
      message,
      notificationEnv(provider, { now: SCENARIO_NOW }),
    );

    expect(message.ackCount).toBe(1);
    expect(message.retryCount).toBe(0);
    expect(provider.nextError).toBeNull();
    const ledger = await db
      .prepare(
        `SELECT state, provider_message_id, last_error FROM notifications
         WHERE hub_id = ? AND idempotency_key = ?`,
      )
      .bind(TEST_HUB, "notification:hub-1:order-timeout:1")
      .first<{
        state: string;
        provider_message_id: string | null;
        last_error: string | null;
      }>();
    expect(ledger).toEqual({
      state: "failed",
      provider_message_id: null,
      last_error: "provider_timeout_uncertain",
    });
    expect(await readOrder("order-timeout")).toMatchObject({ version: 1 });
    const notified = await db
      .prepare(
        "SELECT last_notified_delivery_at FROM orders WHERE id = ? AND hub_id = ?",
      )
      .bind("order-timeout", TEST_HUB)
      .first<{ last_notified_delivery_at: number | null }>();
    expect(notified?.last_notified_delivery_at).toBeNull();
    expect(
      await findOutbox({
        orderId: "order-timeout",
        destination: "notification",
        targetVersion: 1,
      }),
    ).toMatchObject({ status: "done" });
  });

  it("9. a full delivery slot rejects a competing reservation", async () => {
    const winner = await applyChange(
      db,
      manager,
      createInput("order-slot-winner", "slot-c"),
      { now: SCENARIO_NOW },
    );
    expect(winner.order.deliverySlotId).toBe("slot-c");

    await expect(
      applyChange(
        db,
        manager,
        createInput("order-slot-loser", "slot-c"),
        { now: SCENARIO_NOW + 1 },
      ),
    ).rejects.toMatchObject({ code: "SLOT_FULL", status: 422 });

    expect(
      await countRows(
        "SELECT COUNT(*) AS n FROM orders WHERE hub_id = ? AND delivery_slot_id = ?",
        TEST_HUB,
        "slot-c",
      ),
    ).toBe(1);
    expect(await readOrder("order-slot-loser")).toBeNull();
    expect(
      await countRows(
        "SELECT COUNT(*) AS n FROM order_events WHERE hub_id = ? AND order_id = ?",
        TEST_HUB,
        "order-slot-loser",
      ),
    ).toBe(0);
    expect(
      await countRows(
        "SELECT COUNT(*) AS n FROM outbox WHERE hub_id = ? AND order_id = ?",
        TEST_HUB,
        "order-slot-loser",
      ),
    ).toBe(0);
  });

  it("10. nightly reconciliation repairs missing events without overwriting a pending manager change", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new CountingCalendar();
    const projected = await harness.projectedOrder("order-1", calendar);
    await calendar.patch(projected.event.id, {
      summary: "Manager drag pending",
    } as never);
    await db
      .prepare(
        "UPDATE orders SET version = 2, updated_at = ? WHERE id = 'order-1' AND hub_id = ?",
      )
      .bind(CALENDAR_NOW + 1, TEST_HUB)
      .run();
    await db
      .prepare(
        "UPDATE orders SET delivery_at = ? WHERE id = 'order-2' AND hub_id = ?",
      )
      .bind(SLOT_B_START, TEST_HUB)
      .run();
    await seedMissingProjection(harness, "order-2", 2);

    const patchesBefore = calendar.patchCalls;
    const result = await reconcile(harness, calendar);

    expect(result.skippedPending).toBe(1);
    expect(result.enqueued).toBe(1);
    expect(result.unresolved).toBe(0);
    expect(calendar.patchCalls).toBe(patchesBefore);
    expect((await calendar.get(projected.event.id))?.summary).toBe(
      "Manager drag pending",
    );
    expect((await readOrder("order-1"))?.version).toBe(2);

    const repairs = await db
      .prepare(
        `SELECT order_id, operation, target_version, status FROM outbox
         WHERE operation = 'REPAIR_EVENT' ORDER BY order_id`,
      )
      .all<{
        order_id: string;
        operation: string;
        target_version: number;
        status: string;
      }>();
    expect(repairs.results).toEqual([
      {
        order_id: "order-2",
        operation: "REPAIR_EVENT",
        target_version: 2,
        status: "pending",
      },
    ]);

    const repairRow = requireRow(
      await findOutbox({
        orderId: "order-2",
        destination: "calendar",
        operation: "REPAIR_EVENT",
      }),
    );
    const repairMessage = fakeMessage(toQueueMessage(repairRow));
    await processCalendarMessage(repairMessage, {
      LAUNDRY: harness.laundryBinding(),
      SERVICE_TOKEN: TEST_SERVICE_TOKEN,
      GOOGLE_CALENDAR_ID: harness.calendarId,
      googleCalendar: harness.calendarApi(calendar),
      now: () => harness.now,
    });

    expect(repairMessage.ackCount).toBe(1);
    expect(await calendar.get(deterministicEventId("order-2"))).toBeDefined();
    expect((await calendar.get(projected.event.id))?.summary).toBe(
      "Manager drag pending",
    );
    expect((await readOrder("order-1"))?.version).toBe(2);
  });
});
