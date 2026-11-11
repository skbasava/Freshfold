import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OutboxQueueMessage } from "../../packages/contracts/src/queue-messages";
import laundry from "../../workers/laundry/src/index";
import {
  processCalendarMessage,
  type CalendarEventApi,
} from "../../workers/calendar/src/consumer";
import { deterministicEventId } from "../../workers/calendar/src/projection";
import {
  FakeGoogleCalendar,
  FakeGoogleCalendarError,
  type NewFakeCalendarEvent,
} from "../fakes/google-calendar";
import {
  clearLaundryData,
  seedLaundryReadFixtures,
  TEST_HUB,
  TEST_TENANT,
} from "../helpers/laundry-db";

type TestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as TestEnv;
const db = testEnv.LAUNDRY_DB;
const SERVICE_TOKEN = "test-service-token-32-characters-long";
const CALENDAR_ID = "calendar-1";
const NOW = Date.parse("2026-11-11T04:00:00.000Z");

function laundryBinding(): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const ctx = createExecutionContext();
      const response = await laundry.fetch(
        request,
        {
          LAUNDRY_DB: db,
          INTERNAL_CONTEXT_SECRET: "test-internal-context-secret-32-bytes",
          SERVICE_TOKEN,
        } as never,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return response;
    },
  } as Fetcher;
}

function message(
  overrides: Partial<OutboxQueueMessage> = {},
): OutboxQueueMessage {
  return {
    outboxId: "outbox-1",
    hubId: TEST_HUB,
    orderId: "order-1",
    destination: "calendar",
    operation: "UPSERT_EVENT",
    targetVersion: 1,
    mutationId: "mutation-1",
    ...overrides,
  };
}

function fakeMessage(body: unknown) {
  let ackCount = 0;
  let retryCount = 0;
  return {
    body,
    get ackCount() {
      return ackCount;
    },
    get retryCount() {
      return retryCount;
    },
    ack() {
      ackCount += 1;
    },
    retry() {
      retryCount += 1;
    },
  };
}

function consumerEnv(calendar: FakeGoogleCalendar) {
  return {
    LAUNDRY: laundryBinding(),
    SERVICE_TOKEN,
    GOOGLE_CALENDAR_ID: CALENDAR_ID,
    googleCalendar: calendar as unknown as CalendarEventApi,
    now: () => NOW,
  };
}

async function seedCalendarSync(
  input: {
    etag?: string | null;
    syncedVersion?: number;
    eventId?: string;
  } = {},
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO calendar_sync
        (order_id, hub_id, calendar_id, event_id, etag, synced_version,
         sync_status, last_error, last_projected_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'synced', NULL, ?, ?)`,
    )
    .bind(
      "order-1",
      TEST_HUB,
      CALENDAR_ID,
      input.eventId ?? deterministicEventId("order-1"),
      input.etag === undefined ? "etag-1" : input.etag,
      input.syncedVersion ?? 1,
      NOW,
      NOW,
    )
    .run();
}

async function seedOutbox(id: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO outbox
        (id, hub_id, order_id, destination, operation, target_version,
         mutation_id, status, attempts, next_attempt_at, created_at)
       VALUES (?, ?, 'order-1', 'calendar', 'UPSERT_EVENT', 1, ?, 'pending', 0, ?, ?)`,
    )
    .bind(id, TEST_HUB, "mutation-1", NOW, NOW)
    .run();
}

async function readSyncRow() {
  return db
    .prepare(
      `SELECT order_id, hub_id, calendar_id, event_id, etag, synced_version,
              sync_status
       FROM calendar_sync WHERE order_id = 'order-1'`,
    )
    .first<{
      order_id: string;
      hub_id: string;
      calendar_id: string;
      event_id: string;
      etag: string | null;
      synced_version: number;
      sync_status: string;
    }>();
}

class FailingCalendar extends FakeGoogleCalendar {
  constructor(private readonly status: number) {
    super();
  }

  override async insert(_event: NewFakeCalendarEvent): Promise<never> {
    throw new FakeGoogleCalendarError(this.status);
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
});

describe("calendar outbox consumer", () => {
  it("derives a stable base32hex event ID from the order ID", () => {
    const id = deterministicEventId("order-1");

    expect(id).toMatch(/^[a-v0-9]+$/);
    expect(id.length).toBeGreaterThanOrEqual(5);
    expect(id.length).toBeLessThanOrEqual(1024);
    expect(deterministicEventId("order-1")).toBe(id);
    expect(deterministicEventId("order-2")).not.toBe(id);
  });

  it("creates one deterministic minimal event and persists its etag and version", async () => {
    const calendar = new FakeGoogleCalendar();
    const queueMessage = fakeMessage(message());

    await expect(
      processCalendarMessage(queueMessage, consumerEnv(calendar)),
    ).resolves.toBe("acked");

    expect(queueMessage.ackCount).toBe(1);
    expect(queueMessage.retryCount).toBe(0);

    const events = await calendar.list();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: deterministicEventId("order-1"),
      etag: "etag-1",
      status: "confirmed",
      extendedProperties: {
        private: { orderId: "order-1", projectedVersion: "1" },
      },
    });
    expect(events[0]?.summary).not.toContain("9000000001");
    expect(events[0]?.description ?? "").not.toContain("9000000001");
    expect(events[0]?.description ?? "").not.toContain("Alice");

    expect(await readSyncRow()).toEqual({
      order_id: "order-1",
      hub_id: TEST_HUB,
      calendar_id: CALENDAR_ID,
      event_id: deterministicEventId("order-1"),
      etag: "etag-1",
      synced_version: 1,
      sync_status: "synced",
    });
  });

  it("handles a duplicate message without creating a second event", async () => {
    const calendar = new FakeGoogleCalendar();
    const first = fakeMessage(message());
    const second = fakeMessage(message());

    await processCalendarMessage(first, consumerEnv(calendar));
    await processCalendarMessage(second, consumerEnv(calendar));

    expect(first.ackCount).toBe(1);
    expect(second.ackCount).toBe(1);
    expect(await calendar.list()).toHaveLength(1);
  });

  it("skips stale outbox work when the projection is already current", async () => {
    const calendar = new FakeGoogleCalendar();
    await seedCalendarSync({ syncedVersion: 1 });
    const queueMessage = fakeMessage(message());

    await processCalendarMessage(queueMessage, consumerEnv(calendar));

    expect(queueMessage.ackCount).toBe(1);
    expect(await calendar.list()).toEqual([]);
  });

  it("treats an insert conflict as an existing event and patches it", async () => {
    const calendar = new FakeGoogleCalendar();
    const eventId = deterministicEventId("order-1");
    await calendar.insert({
      id: eventId,
      summary: "old projection",
      start: "2026-11-11T05:00:00.000Z",
      end: "2026-11-11T06:00:00.000Z",
      extendedProperties: {
        private: { orderId: "order-1", projectedVersion: "1" },
      },
    });
    const queueMessage = fakeMessage(message());

    await processCalendarMessage(queueMessage, consumerEnv(calendar));

    expect(queueMessage.ackCount).toBe(1);
    const events = await calendar.list();
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).not.toBe("old projection");
    expect(events[0]?.summary).toContain("order-1");
    expect((await readSyncRow())?.etag).toBe("etag-2");
  });

  it("retries 429 and 5xx provider failures", async () => {
    for (const status of [429, 503]) {
      const calendar = new FailingCalendar(status);
      const queueMessage = fakeMessage(message());

      await processCalendarMessage(queueMessage, consumerEnv(calendar));

      expect(queueMessage.ackCount).toBe(0);
      expect(queueMessage.retryCount).toBe(1);
    }
  });

  it("retries when canonical state is behind the target version", async () => {
    const calendar = new FakeGoogleCalendar();
    const queueMessage = fakeMessage(message({ targetVersion: 2 }));

    await processCalendarMessage(queueMessage, consumerEnv(calendar));

    expect(queueMessage.retryCount).toBe(1);
    expect(await calendar.list()).toEqual([]);
  });

  it("acknowledges a stale message when canonical state is ahead", async () => {
    const calendar = new FakeGoogleCalendar();
    await db
      .prepare("UPDATE orders SET version = 3 WHERE id = 'order-1' AND hub_id = ?")
      .bind(TEST_HUB)
      .run();
    const queueMessage = fakeMessage(message({ targetVersion: 1 }));

    await processCalendarMessage(queueMessage, consumerEnv(calendar));

    expect(queueMessage.ackCount).toBe(1);
    expect(await calendar.list()).toEqual([]);
  });

  it("acknowledges when the canonical order no longer exists", async () => {
    const calendar = new FakeGoogleCalendar();
    await db
      .prepare("DELETE FROM orders WHERE id = 'order-1' AND hub_id = ?")
      .bind(TEST_HUB)
      .run();
    const queueMessage = fakeMessage(message());

    await processCalendarMessage(queueMessage, consumerEnv(calendar));

    expect(queueMessage.ackCount).toBe(1);
    expect(queueMessage.retryCount).toBe(0);
  });

  it("marks the outbox operation complete after projection", async () => {
    const calendar = new FakeGoogleCalendar();
    await seedOutbox("outbox-1");
    const queueMessage = fakeMessage(message());

    await processCalendarMessage(queueMessage, consumerEnv(calendar));

    const row = await db
      .prepare("SELECT status, completed_at FROM outbox WHERE id = 'outbox-1'")
      .first<{ status: string; completed_at: number | null }>();
    expect(row).toEqual({ status: "done", completed_at: NOW });
  });

  it("does not complete an outbox row from another hub", async () => {
    const calendar = new FakeGoogleCalendar();
    await db
      .prepare(
        `INSERT INTO outbox
          (id, hub_id, order_id, destination, operation, target_version,
           mutation_id, status, attempts, next_attempt_at, created_at)
         VALUES ('outbox-other', 'hub-2', 'order-1', 'calendar', 'UPSERT_EVENT',
                 1, 'mutation-1', 'pending', 0, ?, ?)`,
      )
      .bind(NOW, NOW)
      .run();
    const queueMessage = fakeMessage(message({ outboxId: "outbox-other" }));

    await processCalendarMessage(queueMessage, consumerEnv(calendar));

    const row = await db
      .prepare("SELECT status FROM outbox WHERE id = 'outbox-other'")
      .first<{ status: string }>();
    expect(row?.status).toBe("pending");
  });

  it("retries transient Laundry failures without touching Google", async () => {
    const calendar = new FakeGoogleCalendar();
    const queueMessage = fakeMessage(message());
    const failingLaundry = {
      fetch: async () => new Response("unavailable", { status: 503 }),
    } as unknown as Fetcher;

    await processCalendarMessage(queueMessage, {
      ...consumerEnv(calendar),
      LAUNDRY: failingLaundry,
      SERVICE_TOKEN,
      GOOGLE_CALENDAR_ID: CALENDAR_ID,
      googleCalendar: calendar as unknown as CalendarEventApi,
      now: () => NOW,
    });

    expect(queueMessage.retryCount).toBe(1);
    expect(await calendar.list()).toEqual([]);
  });

  it("scopes the service request to the message hub", async () => {
    const calendar = new FakeGoogleCalendar();
    const observed: Request[] = [];
    const binding = {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        observed.push(new Request(input, init));
        return new Response("missing", { status: 404 });
      },
    } as unknown as Fetcher;

    await processCalendarMessage(fakeMessage(message()), {
      LAUNDRY: binding,
      SERVICE_TOKEN,
      GOOGLE_CALENDAR_ID: CALENDAR_ID,
      googleCalendar: calendar as unknown as CalendarEventApi,
      now: () => NOW,
    });

    expect(observed[0]?.headers.get("x-service-hub-id")).toBe(TEST_HUB);
    expect(observed[0]?.headers.get("x-service-name")).toBe("calendar");
    expect(observed[0]?.headers.get("x-service-token")).toBe(SERVICE_TOKEN);
  });

  it("never uses the bare tenant as a hub for the service actor", async () => {
    const laundryResponse = await laundryBinding().fetch(
      "https://laundry.internal/internal/calendar/orders/order-1",
      {
        headers: {
          "x-service-token": SERVICE_TOKEN,
          "x-service-name": "calendar",
          "x-service-tenant-id": "system",
          "x-service-hub-id": TEST_HUB,
        },
      },
    );
    expect(laundryResponse.status).toBe(200);
    expect(TEST_TENANT).not.toBe(TEST_HUB);
  });
});
