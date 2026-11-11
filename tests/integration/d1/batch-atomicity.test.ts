import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  counts,
  createSchema,
  guardedCreateStatements,
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
  await seedCustomer(db, "cust-b");
  await seedSlot(db, { id: "slot-other", slotKey: "other", capacity: 5 });
  await seedSlot(db, { id: "slot-final", slotKey: "final", capacity: 1 });
});

function updateInput(overrides: Record<string, unknown> = {}) {
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

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-a",
    hubId: "hub-1",
    customerId: "cust-a",
    serviceType: "wash_fold",
    slotId: "slot-final",
    deliveryAt: now + 86_400_000,
    mutationId: "mut-create-1",
    payloadHash: "hash-create-1",
    now,
    eventId: "event-create-1",
    calendarOutboxId: "out-cal-create-1",
    notificationOutboxId: "out-notify-create-1",
    actorId: "user-desk",
    ...overrides,
  };
}

describe("guarded batch atomicity", () => {
  it("commits the canonical update and all dependent rows once", async () => {
    await seedOrder(db, {
      id: "order-a",
      customerId: "cust-a",
      slotId: "slot-other",
    });

    const results = await db.batch(
      guardedUpdateStatements(db, updateInput() as never),
    );

    expect(results[0]?.meta.changes).toBe(1);
    expect(await counts(db)).toEqual({ events: 1, changes: 1, outbox: 2 });

    const order = await db
      .prepare(
        "SELECT version, delivery_slot_id, last_mutation_id FROM orders WHERE id = ?",
      )
      .bind("order-a")
      .first<{
        version: number;
        delivery_slot_id: string;
        last_mutation_id: string;
      }>();

    expect(order).toEqual({
      version: 2,
      delivery_slot_id: "slot-final",
      last_mutation_id: "mut-1",
    });

    const event = await db
      .prepare(
        "SELECT previous_version, new_version, payload_hash FROM order_events WHERE mutation_id = ?",
      )
      .bind("mut-1")
      .first<{
        previous_version: number;
        new_version: number;
        payload_hash: string;
      }>();

    expect(event).toEqual({
      previous_version: 1,
      new_version: 2,
      payload_hash: "hash-1",
    });
  });

  it("writes no dependent rows when the canonical update affects zero rows", async () => {
    await seedOrder(db, {
      id: "order-a",
      customerId: "cust-a",
      slotId: "slot-other",
    });

    const results = await db.batch(
      guardedUpdateStatements(db, updateInput({ baseVersion: 0 }) as never),
    );

    expect(results[0]?.meta.changes).toBe(0);
    expect(await counts(db)).toEqual({ events: 0, changes: 0, outbox: 0 });

    const order = await db
      .prepare("SELECT version, delivery_slot_id FROM orders WHERE id = ?")
      .bind("order-a")
      .first<{ version: number; delivery_slot_id: string }>();

    expect(order).toEqual({ version: 1, delivery_slot_id: "slot-other" });
  });

  it("enforces capacity on create and does not duplicate a replay", async () => {
    const first = await db.batch(
      guardedCreateStatements(db, createInput() as never),
    );
    expect(first[0]?.meta.changes).toBe(1);

    const second = await db.batch(
      guardedCreateStatements(
        db,
        createInput({
          orderId: "order-b",
          customerId: "cust-b",
          mutationId: "mut-create-2",
          eventId: "event-create-2",
          calendarOutboxId: "out-cal-create-2",
          notificationOutboxId: "out-notify-create-2",
        }) as never,
      ),
    );
    expect(second[0]?.meta.changes).toBe(0);

    const replay = await db.batch(
      guardedCreateStatements(db, createInput() as never),
    );
    expect(replay[0]?.meta.changes).toBe(0);

    const orders = await db
      .prepare("SELECT COUNT(*) AS count FROM orders")
      .first<{ count: number }>();

    expect(orders?.count).toBe(1);
    expect(await counts(db)).toEqual({ events: 1, changes: 1, outbox: 2 });
  });
});
