import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEventApi } from "../../workers/calendar/src/consumer";
import { processCalendarMessage } from "../../workers/calendar/src/consumer";
import {
  runCalendarReconciliation,
  type ReconciliationAlert,
} from "../../workers/calendar/src/reconciliation";
import {
  deterministicEventId,
} from "../../workers/calendar/src/projection";
import {
  FakeGoogleCalendar,
  type FakeCalendarEvent,
  type NewFakeCalendarEvent,
} from "../fakes/google-calendar";
import {
  CALENDAR_NOW,
  RESCHEDULED_START,
  createCalendarHarness,
} from "../helpers/calendar-integration";
import {
  clearLaundryData,
  seedLaundryReadFixtures,
  TEST_HUB,
} from "../helpers/laundry-db";

type TestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as TestEnv;
const db = testEnv.LAUNDRY_DB;

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

async function repairOutboxRows() {
  const result = await db
    .prepare(
      `SELECT id, order_id, target_version, operation, status
       FROM outbox WHERE operation = 'REPAIR_EVENT' ORDER BY order_id`,
    )
    .all<{
      id: string;
      order_id: string;
      target_version: number;
      operation: string;
      status: string;
    }>();
  return result.results;
}

const emptyPollResult = {
  status: "ok" as const,
  fullSync: false,
  pages: 0,
  processed: 0,
  rescheduled: 0,
  reverts: 0,
  restores: 0,
  skipped: 0,
  unknown: 0,
  nextSyncToken: null,
};

function reconcile(
  harness: ReturnType<typeof createCalendarHarness>,
  calendar: FakeGoogleCalendar,
  options: {
    onAlert?: (alert: ReconciliationAlert) => void;
    onMetric?: (name: string, value: number) => void;
    poll?: () => Promise<typeof emptyPollResult>;
  } = {},
) {
  return runCalendarReconciliation({
    laundry: harness.laundryClient(),
    calendar: harness.calendarApi(calendar),
    calendarId: harness.calendarId,
    hubId: harness.hubId,
    now: harness.now,
    onAlert: options.onAlert,
    onMetric: options.onMetric,
    poll: options.poll,
  });
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
});

describe("nightly calendar reconciliation", () => {
  it("ingests outstanding manager edits before repairing a missing event", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    await harness.seedSlot("slot-reschedule", RESCHEDULED_START);
    const projected = await harness.projectedOrder("order-1", calendar);
    await harness.moveEvent(calendar, projected.event, RESCHEDULED_START);
    await seedMissingProjection(harness, "order-2", 2);

    const result = await reconcile(harness, calendar);

    expect(result.ingested.rescheduled).toBe(1);
    const order = await db
      .prepare("SELECT version FROM orders WHERE id = 'order-1' AND hub_id = ?")
      .bind(TEST_HUB)
      .first<{ version: number }>();
    expect(order?.version).toBe(2);

    const repairs = await repairOutboxRows();
    expect(repairs).toEqual([
      expect.objectContaining({
        order_id: "order-2",
        target_version: 2,
        operation: "REPAIR_EVENT",
        status: "pending",
      }),
    ]);
    expect(result.enqueued).toBe(1);
  });

  it("repairs a missing event when the queued repair is consumed", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    await seedMissingProjection(harness, "order-2", 2);

    await reconcile(harness, calendar);
    const [row] = await repairOutboxRows();

    const message = {
      body: {
        outboxId: row!.id,
        hubId: TEST_HUB,
        orderId: "order-2",
        destination: "calendar",
        operation: "REPAIR_EVENT",
        targetVersion: 2,
        mutationId: "calendar-reconcile:order-2:2",
      },
      ackCount: 0,
      retryCount: 0,
      ack() {
        this.ackCount += 1;
      },
      retry() {
        this.retryCount += 1;
      },
    };

    await processCalendarMessage(message, {
      LAUNDRY: harness.laundryBinding(),
      SERVICE_TOKEN: "test-service-token-32-characters-long",
      GOOGLE_CALENDAR_ID: harness.calendarId,
      googleCalendar: calendar as unknown as CalendarEventApi,
      now: () => CALENDAR_NOW,
    });

    expect(message.ackCount).toBe(1);
    expect(await calendar.get(deterministicEventId("order-2"))).toBeDefined();
  });

  it("does not overwrite an order with an unprocessed projection", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new CountingCalendar();
    const projected = await harness.projectedOrder("order-1", calendar);
    await db
      .prepare("DELETE FROM orders WHERE id = 'order-2' AND hub_id = ?")
      .bind(TEST_HUB)
      .run();
    await db
      .prepare("UPDATE orders SET version = 2 WHERE id = 'order-1' AND hub_id = ?")
      .bind(TEST_HUB)
      .run();
    await harness.moveEvent(calendar, projected.event, RESCHEDULED_START);
    const patchesBefore = calendar.patchCalls;

    const result = await reconcile(harness, calendar);

    expect(result.skippedPending).toBe(1);
    expect(result.enqueued).toBe(0);
    expect(calendar.patchCalls).toBe(patchesBefore);
    expect(await repairOutboxRows()).toEqual([]);
    const event = await calendar.get(projected.event.id);
    expect(event?.start).toMatchObject({
      dateTime: new Date(RESCHEDULED_START).toISOString(),
    });
  });

  it("records and alerts on an unresolved manager-edit conflict without overwriting", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new CountingCalendar();
    const projected = await harness.projectedOrder("order-1", calendar);
    await db
      .prepare("DELETE FROM orders WHERE id = 'order-2' AND hub_id = ?")
      .bind(TEST_HUB)
      .run();
    await calendar.patch(projected.event.id, {
      summary: "Manager title",
    } as never);
    const patchesBefore = calendar.patchCalls;
    const alerts: ReconciliationAlert[] = [];
    const metrics: Array<{ name: string; value: number }> = [];

    const result = await reconcile(harness, calendar, {
      poll: async () => emptyPollResult,
      onAlert: (alert) => alerts.push(alert),
      onMetric: (name, value) => metrics.push({ name, value }),
    });

    expect(result.unresolved).toBe(1);
    expect(result.enqueued).toBe(0);
    expect(calendar.patchCalls).toBe(patchesBefore);
    expect((await calendar.get(projected.event.id))?.summary).toBe(
      "Manager title",
    );
    expect(await repairOutboxRows()).toEqual([]);

    const repair = await db
      .prepare(
        `SELECT action, outcome FROM calendar_repairs
         WHERE hub_id = ? ORDER BY created_at ASC LIMIT 1`,
      )
      .bind(TEST_HUB)
      .first<{ action: string; outcome: string }>();
    expect(repair).toEqual({
      action: "reconciliation_conflict",
      outcome: "unresolved",
    });

    expect(alerts).toEqual([
      expect.objectContaining({
        code: "calendar_reconciliation_conflict",
        orderId: "order-1",
      }),
    ]);
    expect(metrics).toEqual(
      expect.arrayContaining([
        { name: "calendar_reconciliation_unresolved", value: 1 },
        { name: "calendar_reconciliation_drift", value: 1 },
      ]),
    );
  });

  it("never deletes unknown events", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    await calendar.insert({
      id: "manager-created",
      summary: "Not an order",
      start: {
        dateTime: new Date("2026-11-12T04:00:00.000Z").toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: new Date("2026-11-12T05:00:00.000Z").toISOString(),
        timeZone: "Asia/Kolkata",
      },
    } as unknown as NewFakeCalendarEvent);

    const result = await reconcile(harness, calendar);

    expect(result.unknownEvents).toBeGreaterThanOrEqual(1);
    expect(await calendar.get("manager-created")).toBeDefined();
  });

  it("emits reconciliation metrics", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    await harness.projectedOrder("order-1", calendar);
    const onMetric = vi.fn();

    await reconcile(harness, calendar, { onMetric });

    expect(onMetric).toHaveBeenCalledWith(
      "calendar_reconciliation_orders",
      2,
    );
    expect(onMetric).toHaveBeenCalledWith(
      "calendar_reconciliation_healthy",
      1,
    );
  });
});
