import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
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

describe("concurrent final-slot reservation", () => {
  it("lets exactly one of two simultaneous updates take the final slot", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await resetData(db);
      await seedHub(db);
      await seedCustomer(db, "cust-a");
      await seedCustomer(db, "cust-b");
      await seedSlot(db, {
        id: "slot-other-a",
        slotKey: `other-a-${attempt}`,
        capacity: 5,
      });
      await seedSlot(db, {
        id: "slot-other-b",
        slotKey: `other-b-${attempt}`,
        capacity: 5,
      });
      await seedSlot(db, {
        id: "slot-final",
        slotKey: `final-${attempt}`,
        capacity: 1,
      });
      await seedOrder(db, {
        id: "order-a",
        customerId: "cust-a",
        slotId: "slot-other-a",
      });
      await seedOrder(db, {
        id: "order-b",
        customerId: "cust-b",
        slotId: "slot-other-b",
      });

      const inputA = {
        orderId: "order-a",
        hubId: "hub-1",
        mutationId: `mut-a-${attempt}`,
        payloadHash: `hash-a-${attempt}`,
        baseVersion: 1,
        slotId: "slot-final",
        deliveryAt: now + 86_400_000,
        status: "confirmed",
        now,
        eventId: `event-a-${attempt}`,
        calendarOutboxId: `out-cal-a-${attempt}`,
        notificationOutboxId: `out-notify-a-${attempt}`,
        actorId: "user-desk",
      };

      const inputB = {
        ...inputA,
        orderId: "order-b",
        mutationId: `mut-b-${attempt}`,
        payloadHash: `hash-b-${attempt}`,
        eventId: `event-b-${attempt}`,
        calendarOutboxId: `out-cal-b-${attempt}`,
        notificationOutboxId: `out-notify-b-${attempt}`,
      };

      const [resultA, resultB] = await Promise.all([
        db.batch(guardedUpdateStatements(db, inputA)),
        db.batch(guardedUpdateStatements(db, inputB)),
      ]);

      const changes = [
        resultA[0]?.meta.changes,
        resultB[0]?.meta.changes,
      ].sort((left, right) => (left ?? 0) - (right ?? 0));

      expect(changes).toEqual([0, 1]);

      const finalCount = await db
        .prepare(
          "SELECT COUNT(*) AS count FROM orders WHERE hub_id = 'hub-1' AND delivery_slot_id = 'slot-final'",
        )
        .first<{ count: number }>();

      expect(finalCount?.count).toBe(1);
      expect(await counts(db)).toEqual({ events: 1, changes: 1, outbox: 2 });
    }
  });
});
