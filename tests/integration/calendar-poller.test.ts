import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import laundry from "../../workers/laundry/src/index";
import { getOrder } from "../../workers/laundry/src/orders/read";
import type { CalendarEventApi } from "../../workers/calendar/src/consumer";
import { runCalendarPoll } from "../../workers/calendar/src/poller";
import { LaundryCalendarClient } from "../../workers/calendar/src/laundry";
import {
  buildCanonicalEvent,
  deterministicEventId,
} from "../../workers/calendar/src/projection";
import {
  FakeGoogleCalendar,
  FakeGoogleCalendarError,
  type FakeCalendarEvent,
  type NewFakeCalendarEvent,
} from "../fakes/google-calendar";
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
const SERVICE_TOKEN = "test-service-token-32-characters-long";
const CALENDAR_ID = "calendar-1";
const NOW = Date.parse("2026-11-11T04:00:00.000Z");
const CANONICAL_START = Date.parse("2026-11-12T04:00:00.000Z");
const RESCHEDULED_START = Date.parse("2026-11-12T05:00:00.000Z");

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
          LAUNDRY_CLOCK: () => NOW,
        } as never,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return response;
    },
  } as Fetcher;
}

function laundryClient(): LaundryCalendarClient {
  return new LaundryCalendarClient({
    LAUNDRY: laundryBinding(),
    SERVICE_TOKEN,
  });
}

function calendarApi(calendar: FakeGoogleCalendar): CalendarEventApi {
  const api = {
    insert: (event: NewFakeCalendarEvent) => calendar.insert(event),
    get: (eventId: string) => calendar.get(eventId),
    list: (parameters: Parameters<FakeGoogleCalendar["listPage"]>[0]) =>
      calendar.listPage(parameters),
    patch: (
      eventId: string,
      patch: Partial<Omit<FakeCalendarEvent, "id" | "etag">>,
      options?: { etag?: string | null },
    ) =>
      calendar.patch(eventId, patch, {
        etag: options?.etag ?? undefined,
      }),
    delete: (eventId: string, options?: { etag?: string | null }) =>
      calendar.delete(eventId, { etag: options?.etag ?? undefined }),
  };
  return api as unknown as CalendarEventApi;
}

async function seedSlot(
  id: string,
  startsAt: number,
  capacity = 2,
): Promise<void> {
  const local = new Date(startsAt).toISOString().slice(0, 10);
  await db
    .prepare(
      `INSERT INTO delivery_slots
        (id, hub_id, slot_key, local_date, local_start, starts_at, ends_at,
         capacity, active, created_at)
       VALUES (?, ?, ?, ?, '10:30', ?, ?, ?, 1, ?)`,
    )
    .bind(
      id,
      TEST_HUB,
      `${id}-key`,
      local,
      startsAt,
      startsAt + 3_600_000,
      capacity,
      NOW,
    )
    .run();
}

async function projectedOrder(
  orderId: string,
  calendar: FakeGoogleCalendar,
  options: { version?: number; status?: string; deliveryAt?: number } = {},
): Promise<{ event: FakeCalendarEvent; order: NonNullable<Awaited<ReturnType<typeof getOrder>>> }> {
  const version = options.version ?? 1;
  const deliveryAt = options.deliveryAt ?? CANONICAL_START;
  await db
    .prepare(
      `UPDATE orders SET delivery_at = ?, version = ?, status = ?,
              updated_at = ?, last_mutation_id = ?
       WHERE id = ? AND hub_id = ?`,
    )
    .bind(
      deliveryAt,
      version,
      options.status ?? "confirmed",
      NOW,
      `seed-${orderId}`,
      orderId,
      TEST_HUB,
    )
    .run();

  const order = await getOrder(db, TEST_HUB, orderId);
  if (!order) {
    throw new Error(`missing order ${orderId}`);
  }

  const canonical = buildCanonicalEvent(order);
  if (!canonical) {
    throw new Error("canonical event missing");
  }

  const event = await calendar.insert(canonical as unknown as NewFakeCalendarEvent);
  await db
    .prepare(
      `INSERT INTO calendar_sync
        (order_id, hub_id, calendar_id, event_id, etag, synced_version,
         sync_status, last_error, last_projected_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'synced', NULL, ?, ?)`,
    )
    .bind(
      orderId,
      TEST_HUB,
      CALENDAR_ID,
      event.id,
      event.etag,
      version,
      NOW,
      NOW,
    )
    .run();

  return { event, order };
}

async function moveEvent(
  calendar: FakeGoogleCalendar,
  event: FakeCalendarEvent,
  startAt: number,
): Promise<void> {
  await calendar.patch(
    event.id,
    {
      start: {
        dateTime: new Date(startAt).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: new Date(startAt + 3_600_000).toISOString(),
        timeZone: "Asia/Kolkata",
      },
    } as never,
  );
}

async function seedSyncState(syncToken: string | null): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sync_state
        (calendar_id, hub_id, sync_token, last_polled_at, last_full_sync_at,
         recovery_state, last_error, updated_at)
       VALUES (?, ?, ?, NULL, NULL, 'idle', NULL, ?)`,
    )
    .bind(CALENDAR_ID, TEST_HUB, syncToken, NOW)
    .run();
}

async function readSyncState() {
  return db
    .prepare(
      `SELECT calendar_id, hub_id, sync_token, last_polled_at, last_full_sync_at,
              recovery_state, last_error
       FROM sync_state WHERE calendar_id = ? AND hub_id = ?`,
    )
    .bind(CALENDAR_ID, TEST_HUB)
    .first<{
      calendar_id: string;
      hub_id: string;
      sync_token: string | null;
      last_polled_at: number | null;
      last_full_sync_at: number | null;
      recovery_state: string;
      last_error: string | null;
    }>();
}

async function repairCount(): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM calendar_repairs WHERE hub_id = ?")
    .bind(TEST_HUB)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function poll(
  calendar: FakeGoogleCalendar,
  options: { pageSize?: number } = {},
) {
  return runCalendarPoll({
    laundry: laundryClient(),
    calendar: calendarApi(calendar),
    calendarId: CALENDAR_ID,
    hubId: TEST_HUB,
    now: NOW,
    pageSize: options.pageSize,
  });
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
});

describe("calendar poller", () => {
  it("suppresses the application's own etag echo", async () => {
    const calendar = new FakeGoogleCalendar();
    const { event } = await projectedOrder("order-1", calendar);

    const result = await poll(calendar);

    expect(result.status).toBe("ok");
    expect(result.rescheduled).toBe(0);
    expect(result.reverts).toBe(0);
    expect((await calendar.get(event.id))?.summary).toBe(event.summary);
    const order = await getOrder(db, TEST_HUB, "order-1");
    expect(order?.version).toBe(1);
    expect(await readSyncState()).toMatchObject({
      sync_token: calendar.currentSyncToken(),
      recovery_state: "idle",
    });
  });

  it("skips a semantically canonical event even when the etag changed", async () => {
    const calendar = new FakeGoogleCalendar();
    const { event } = await projectedOrder("order-1", calendar);
    await calendar.patch(event.id, {
      summary: event.summary,
      start: event.start,
      end: event.end,
    } as never);

    const result = await poll(calendar);

    expect(result.rescheduled).toBe(0);
    expect(result.reverts).toBe(0);
    expect((await getOrder(db, TEST_HUB, "order-1"))?.version).toBe(1);
  });

  it("applies a valid manager start-time move through applyChange", async () => {
    const calendar = new FakeGoogleCalendar();
    await seedSlot("slot-reschedule", RESCHEDULED_START);
    const { event } = await projectedOrder("order-1", calendar);
    await moveEvent(calendar, event, RESCHEDULED_START);

    const result = await poll(calendar);

    expect(result.rescheduled).toBe(1);
    const order = await getOrder(db, TEST_HUB, "order-1");
    expect(order?.version).toBe(2);
    expect(order?.deliveryAt).toBe(RESCHEDULED_START);

    const eventRow = await db
      .prepare(
        `SELECT source, actor_type, actor_id FROM order_events
         WHERE order_id = 'order-1' AND new_version = 2`,
      )
      .first<{ source: string; actor_type: string; actor_id: string }>();
    expect(eventRow).toEqual({
      source: "calendar",
      actor_type: "system",
      actor_id: "system:calendar",
    });

    const second = await poll(calendar);
    expect(second.rescheduled).toBe(0);
    expect((await getOrder(db, TEST_HUB, "order-1"))?.version).toBe(2);
  });

  it("processes every pagination page before persisting the next token", async () => {
    const calendar = new FakeGoogleCalendar();
    const first = await projectedOrder("order-1", calendar);
    const second = await projectedOrder("order-2", calendar);
    await calendar.patch(first.event.id, { summary: "manager title" } as never);
    await calendar.patch(second.event.id, { summary: "manager title" } as never);
    await seedSyncState("sync-0");

    const result = await poll(calendar, { pageSize: 1 });

    expect(result.pages).toBe(2);
    expect(result.reverts).toBe(2);
    expect(await repairCount()).toBe(2);
    const savedToken = (await readSyncState())?.sync_token;
    expect(savedToken).toMatch(/^sync-\d+$/);
    expect(savedToken).not.toBe("sync-0");
  });

  it("does not advance the token when a later page fails", async () => {
    class FailingPageCalendar extends FakeGoogleCalendar {
      override async listPage(
        options: {
          syncToken?: string;
          pageToken?: string;
          showDeleted?: boolean;
          maxResults?: number;
        } = {},
      ) {
        if (options.pageToken === "1") {
          throw new FakeGoogleCalendarError(429);
        }
        return super.listPage(options);
      }
    }

    const calendar = new FailingPageCalendar();
    const first = await projectedOrder("order-1", calendar);
    const second = await projectedOrder("order-2", calendar);
    await calendar.patch(first.event.id, { summary: "manager title" } as never);
    await calendar.patch(second.event.id, { summary: "manager title" } as never);
    await seedSyncState("sync-0");

    await expect(poll(calendar, { pageSize: 1 })).rejects.toMatchObject({
      status: 429,
    });

    expect((await readSyncState())?.sync_token).toBe("sync-0");
  });

  it("recovers from an HTTP 410 with a full resync", async () => {
    const calendar = new FakeGoogleCalendar();
    await projectedOrder("order-1", calendar);
    await seedSyncState("expired-token");

    const result = await poll(calendar);

    expect(result.fullSync).toBe(true);
    const state = await readSyncState();
    expect(state).toMatchObject({
      recovery_state: "idle",
      last_full_sync_at: NOW,
    });
    expect(state?.sync_token).not.toBe("expired-token");
    expect(state?.sync_token).toBe(calendar.currentSyncToken());
  });

  it("leaves unknown events alone", async () => {
    const calendar = new FakeGoogleCalendar();
    await calendar.insert({
      id: "manager-created",
      summary: "Not an order",
      start: {
        dateTime: new Date(CANONICAL_START).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: new Date(CANONICAL_START + 3_600_000).toISOString(),
        timeZone: "Asia/Kolkata",
      },
    } as unknown as NewFakeCalendarEvent);

    const result = await poll(calendar);

    expect(result.unknown).toBe(1);
    expect(await calendar.get("manager-created")).toBeDefined();
  });

  it("reverts a forbidden title edit without changing the order", async () => {
    const calendar = new FakeGoogleCalendar();
    const { event } = await projectedOrder("order-1", calendar);
    await calendar.patch(event.id, { summary: "manager title" } as never);

    const result = await poll(calendar);

    expect(result.reverts).toBe(1);
    expect((await calendar.get(event.id))?.summary).toBe(event.summary);
    expect((await getOrder(db, TEST_HUB, "order-1"))?.version).toBe(1);
    expect(await repairCount()).toBe(1);
  });

  it("restores a deleted event", async () => {
    const calendar = new FakeGoogleCalendar();
    const { event } = await projectedOrder("order-1", calendar);
    await calendar.delete(event.id);

    const result = await poll(calendar);

    expect(result.restores).toBe(1);
    const restored = await calendar.get(event.id);
    expect(restored?.status).toBe("confirmed");
    expect(restored?.summary).toBe(event.summary);
    expect(await repairCount()).toBe(1);
  });

  it("surfaces a 429 without advancing the token", async () => {
    class RateLimitedCalendar extends FakeGoogleCalendar {
      override async listPage(): Promise<never> {
        throw new FakeGoogleCalendarError(429);
      }
    }

    const calendar = new RateLimitedCalendar();
    await seedSyncState(null);

    await expect(poll(calendar)).rejects.toMatchObject({ status: 429 });
    expect((await readSyncState())?.sync_token).toBeNull();
  });
});
