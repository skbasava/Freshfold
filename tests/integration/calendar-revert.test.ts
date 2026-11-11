import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  FakeGoogleCalendar,
  type FakeCalendarEvent,
} from "../fakes/google-calendar";
import {
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

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
});

describe("forbidden-edit reverts", () => {
  const forbiddenEdits: Array<{
    name: string;
    mutate: (
      calendar: FakeGoogleCalendar,
      event: FakeCalendarEvent,
    ) => Promise<void>;
  }> = [
    {
      name: "title",
      mutate: async (calendar, event) => {
        await calendar.patch(event.id, { summary: "Manager title" } as never);
      },
    },
    {
      name: "description",
      mutate: async (calendar, event) => {
        await calendar.patch(event.id, {
          description: "Phone +919000000001",
        } as never);
      },
    },
    {
      name: "color",
      mutate: async (calendar, event) => {
        await calendar.patch(event.id, { colorId: "5" } as never);
      },
    },
    {
      name: "recurrence",
      mutate: async (calendar, event) => {
        await calendar.patch(event.id, {
          recurrence: ["RRULE:FREQ=DAILY"],
        } as never);
      },
    },
    {
      name: "resize",
      mutate: async (calendar, event) => {
        await calendar.patch(event.id, {
          end: {
            dateTime: new Date(
              Date.parse(
                typeof event.end === "string"
                  ? event.end
                  : (event.end as { dateTime: string }).dateTime,
              ) + 3_600_000,
            ).toISOString(),
            timeZone: "Asia/Kolkata",
          },
        } as never);
      },
    },
    {
      name: "all-day",
      mutate: async (calendar, event) => {
        await calendar.patch(event.id, {
          start: { date: "2026-11-12" },
          end: { date: "2026-11-13" },
        } as never);
      },
    },
  ];

  it.each(forbiddenEdits)("reverts a forbidden $name edit", async ({ mutate }) => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    const { event } = await harness.projectedOrder("order-1", calendar);
    await mutate(calendar, event);

    const result = await harness.poll(calendar);

    expect(result.reverts).toBe(1);
    const canonical = await calendar.get(event.id);
    expect(canonical?.summary).toBe(event.summary);
    expect(canonical?.description).toBe(event.description);
    expect(canonical?.colorId ?? null).toBeNull();
    expect(canonical?.recurrence ?? []).toEqual([]);
    expect(canonical?.status).toBe("confirmed");
    expect((await harness.repairs())[0]).toMatchObject({
      outcome: "repaired",
    });
    expect((await harness.repairCount())).toBe(1);
  });

  it("restores a deleted event with the same deterministic ID", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    const { event } = await harness.projectedOrder("order-1", calendar);
    await calendar.delete(event.id);

    const result = await harness.poll(calendar);

    expect(result.restores).toBe(1);
    expect((await calendar.get(event.id))?.status).toBe("confirmed");
    expect((await harness.repairs())[0]).toMatchObject({
      action: "restore_event",
      outcome: "restored",
    });
  });

  it("re-fetches and re-evaluates after a 412 precondition failure", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new CountingCalendar();
    const { event } = await harness.projectedOrder("order-1", calendar);
    await calendar.patch(event.id, { summary: "Manager title" } as never);
    const patchesBefore = calendar.patchCalls;
    calendar.failNextPatchWith412 = true;

    const result = await harness.poll(calendar);

    expect(result.reverts).toBe(1);
    expect(calendar.patchCalls - patchesBefore).toBeGreaterThanOrEqual(2);
    expect((await calendar.get(event.id))?.summary).toBe(event.summary);
  });

  it("reverts a move into the past without changing the order", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    const { event } = await harness.projectedOrder("order-1", calendar);
    const pastStart = harness.now - 3_600_000;
    await calendar.patch(
      event.id,
      {
        start: {
          dateTime: new Date(pastStart).toISOString(),
          timeZone: "Asia/Kolkata",
        },
        end: {
          dateTime: new Date(pastStart + 3_600_000).toISOString(),
          timeZone: "Asia/Kolkata",
        },
      } as never,
    );

    const result = await harness.poll(calendar);

    expect(result.rescheduled).toBe(0);
    expect(result.reverts).toBe(1);
    expect((await calendar.get(event.id))?.summary).toBe(event.summary);
    const order = await db
      .prepare("SELECT version FROM orders WHERE id = 'order-1' AND hub_id = ?")
      .bind(TEST_HUB)
      .first<{ version: number }>();
    expect(order?.version).toBe(1);
  });

  it("does not call applyChange for a rejected reschedule and records it", async () => {
    const harness = createCalendarHarness(db);
    const calendar = new FakeGoogleCalendar();
    const { event } = await harness.projectedOrder("order-1", calendar);
    await harness.moveEvent(calendar, event, RESCHEDULED_START);

    const result = await harness.poll(calendar);

    expect(result.rescheduled).toBe(0);
    expect(result.reverts).toBe(1);

    const order = await db
      .prepare("SELECT version, delivery_at FROM orders WHERE id = 'order-1' AND hub_id = ?")
      .bind(TEST_HUB)
      .first<{ version: number; delivery_at: number }>();
    expect(order?.version).toBe(1);
    expect(order?.delivery_at).toBe(
      Date.parse("2026-11-12T04:00:00.000Z"),
    );

    const eventRows = await db
      .prepare("SELECT COUNT(*) AS n FROM order_events WHERE order_id = 'order-1'")
      .first<{ n: number }>();
    expect(eventRows?.n).toBe(0);

    const repair = await db
      .prepare(
        `SELECT action, outcome, detail_json FROM calendar_repairs
         WHERE hub_id = ? ORDER BY created_at ASC LIMIT 1`,
      )
      .bind(TEST_HUB)
      .first<{ action: string; outcome: string; detail_json: string }>();
    expect(repair?.action).toBe("rejected_reschedule");
    expect(repair?.outcome).toBe("repaired");
    expect(JSON.parse(repair?.detail_json ?? "{}")).toMatchObject({
      fields: ["start", "end"],
    });
  });
});
