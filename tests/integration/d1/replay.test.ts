import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  counts,
  createSchema,
  guardedUpdateStatements,
  resetData,
  seedCustomer,
  seedHub,
  seedOrder,
  seedSlot,
} from "./helpers";

type LaundryTestEnv = { LAUNDRY_DB: D1Database };
const db = (env as unknown as LaundryTestEnv).LAUNDRY_DB;
const now = 1_700_000_000_000;

beforeAll(async () => {
  await createSchema(db);
});

beforeEach(async () => {
  await resetData(db);
  await seedHub(db);
  await seedCustomer(db, "cust-a");
  await seedSlot(db, { id: "slot-other", slotKey: "other", capacity: 5 });
  await seedSlot(db, { id: "slot-final", slotKey: "final", capacity: 1 });
  await seedOrder(db, {
    id: "order-a",
    customerId: "cust-a",
    slotId: "slot-other",
  });
});

function input(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-a",
    hubId: "hub-1",
    mutationId: "mut-1",
    payloadHash: "hash-1",
    baseVersion: 1,
    slotId: "slot-final",
    deliveryAt: now + 86_400_000,
    status: "confirmed",
    now,
    eventId: "event-1",
    calendarOutboxId: "out-cal-1",
    notificationOutboxId: "out-notify-1",
    actorId: "user-desk",
    ...overrides,
  };
}

describe("mutation replay", () => {
  it("writes nothing on replay and preserves the stored result", async () => {
    await db.batch(guardedUpdateStatements(db, input() as never));
    const afterFirst = await counts(db);

    const replay = await db.batch(
      guardedUpdateStatements(db, input() as never),
    );

    expect(replay[0]?.meta.changes).toBe(0);
    expect(await counts(db)).toEqual(afterFirst);

    const order = await db
      .prepare("SELECT version, last_mutation_id FROM orders WHERE id = ?")
      .bind("order-a")
      .first<{ version: number; last_mutation_id: string }>();

    expect(order).toEqual({ version: 2, last_mutation_id: "mut-1" });
  });

  it("rejects the same mutation ID with a different payload hash", async () => {
    await db.batch(guardedUpdateStatements(db, input() as never));

    const mismatch = await db.batch(
      guardedUpdateStatements(
        db,
        input({ payloadHash: "different-hash" }) as never,
      ),
    );

    expect(mismatch[0]?.meta.changes).toBe(0);

    const stored = await db
      .prepare(
        "SELECT payload_hash FROM order_events WHERE hub_id = ? AND mutation_id = ?",
      )
      .bind("hub-1", "mut-1")
      .first<{ payload_hash: string }>();

    expect(stored?.payload_hash).toBe("hash-1");
    expect(stored?.payload_hash).not.toBe("different-hash");
    expect(await counts(db)).toEqual({ events: 1, changes: 1, outbox: 2 });
  });

  it("writes nothing for a different stale mutation", async () => {
    await db.batch(guardedUpdateStatements(db, input() as never));

    const stale = await db.batch(
      guardedUpdateStatements(
        db,
        input({
          mutationId: "mut-stale",
          payloadHash: "hash-stale",
          eventId: "event-stale",
          calendarOutboxId: "out-cal-stale",
          notificationOutboxId: "out-notify-stale",
        }) as never,
      ),
    );

    expect(stale[0]?.meta.changes).toBe(0);
    expect(await counts(db)).toEqual({ events: 1, changes: 1, outbox: 2 });
  });
});
