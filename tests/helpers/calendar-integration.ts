import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import laundry from "../../workers/laundry/src/index";
import { getOrder } from "../../workers/laundry/src/orders/read";
import type { CalendarEventApi } from "../../workers/calendar/src/consumer";
import { runCalendarPoll } from "../../workers/calendar/src/poller";
import { LaundryCalendarClient } from "../../workers/calendar/src/laundry";
import {
  buildCanonicalEvent,
  deterministicEventId,
} from "../../workers/calendar/src/projection";
import type {
  FakeCalendarEvent,
  NewFakeCalendarEvent,
} from "../fakes/google-calendar";
import { FakeGoogleCalendar } from "../fakes/google-calendar";
import { TEST_HUB } from "./laundry-db";

export const CALENDAR_ID = "calendar-1";
export const SERVICE_TOKEN = "test-service-token-32-characters-long";
export const CALENDAR_NOW = Date.parse("2026-11-11T04:00:00.000Z");
export const CANONICAL_START = Date.parse("2026-11-12T04:00:00.000Z");
export const RESCHEDULED_START = Date.parse("2026-11-12T05:00:00.000Z");

export function createCalendarHarness(
  db: D1Database,
  options: {
    calendarId?: string;
    hubId?: string;
    now?: number;
  } = {},
) {
  const calendarId = options.calendarId ?? CALENDAR_ID;
  const hubId = options.hubId ?? TEST_HUB;
  const now = options.now ?? CALENDAR_NOW;

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
            LAUNDRY_CLOCK: () => now,
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
        writeOptions?: { etag?: string | null },
      ) =>
        calendar.patch(eventId, patch, {
          etag: writeOptions?.etag ?? undefined,
        }),
      delete: (eventId: string, writeOptions?: { etag?: string | null }) =>
        calendar.delete(eventId, {
          etag: writeOptions?.etag ?? undefined,
        }),
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
        hubId,
        `${id}-key`,
        local,
        startsAt,
        startsAt + 3_600_000,
        capacity,
        now,
      )
      .run();
  }

  async function projectedOrder(
    orderId: string,
    calendar: FakeGoogleCalendar,
    projected: {
      version?: number;
      status?: string;
      deliveryAt?: number;
    } = {},
  ): Promise<{
    event: FakeCalendarEvent;
    order: NonNullable<Awaited<ReturnType<typeof getOrder>>>;
  }> {
    const version = projected.version ?? 1;
    const deliveryAt = projected.deliveryAt ?? CANONICAL_START;
    await db
      .prepare(
        `UPDATE orders SET delivery_at = ?, version = ?, status = ?,
                updated_at = ?, last_mutation_id = ?
         WHERE id = ? AND hub_id = ?`,
      )
      .bind(
        deliveryAt,
        version,
        projected.status ?? "confirmed",
        now,
        `seed-${orderId}`,
        orderId,
        hubId,
      )
      .run();

    const order = await getOrder(db, hubId, orderId);
    if (!order) {
      throw new Error(`missing order ${orderId}`);
    }

    const canonical = buildCanonicalEvent(order);
    if (!canonical) {
      throw new Error("canonical event missing");
    }

    const event = await calendar.insert(
      canonical as unknown as NewFakeCalendarEvent,
    );
    await db
      .prepare(
        `INSERT INTO calendar_sync
          (order_id, hub_id, calendar_id, event_id, etag, synced_version,
           sync_status, last_error, last_projected_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'synced', NULL, ?, ?)`,
      )
      .bind(
        orderId,
        hubId,
        calendarId,
        event.id,
        event.etag,
        version,
        now,
        now,
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
      .bind(calendarId, hubId, syncToken, now)
      .run();
  }

  async function readSyncState() {
    return db
      .prepare(
        `SELECT calendar_id, hub_id, sync_token, last_polled_at, last_full_sync_at,
                recovery_state, last_error
         FROM sync_state WHERE calendar_id = ? AND hub_id = ?`,
      )
      .bind(calendarId, hubId)
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
      .bind(hubId)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async function repairs() {
    const result = await db
      .prepare(
        `SELECT action, outcome, detail_json FROM calendar_repairs
         WHERE hub_id = ? ORDER BY created_at ASC`,
      )
      .bind(hubId)
      .all<{ action: string; outcome: string; detail_json: string }>();
    return result.results;
  }

  function poll(
    calendar: FakeGoogleCalendar,
    pollOptions: { pageSize?: number } = {},
  ) {
    return runCalendarPoll({
      laundry: laundryClient(),
      calendar: calendarApi(calendar),
      calendarId,
      hubId,
      now,
      pageSize: pollOptions.pageSize,
    });
  }

  return {
    calendarId,
    hubId,
    now,
    laundryBinding,
    laundryClient,
    calendarApi,
    seedSlot,
    projectedOrder,
    moveEvent,
    seedSyncState,
    readSyncState,
    repairCount,
    repairs,
    poll,
    deterministicEventId,
    buildCanonicalEvent,
  };
}
