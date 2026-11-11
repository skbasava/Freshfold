import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createSchema,
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
  await seedOrder(db, {
    id: "order-a",
    customerId: "cust-a",
    slotId: "slot-other",
  });
  for (const statement of [
    "DROP TRIGGER IF EXISTS trg_audit",
    "DROP TRIGGER IF EXISTS trg_guard",
    "DROP TABLE IF EXISTS trigger_audit",
  ]) {
    await db.prepare(statement).run();
  }
});

describe("trigger and RETURNING behavior in D1 batch", () => {
  it("executes AFTER UPDATE triggers inside a batch", async () => {
    await db.exec("CREATE TABLE trigger_audit (order_id TEXT, version INTEGER)");
    await db
      .prepare(
        `CREATE TRIGGER trg_audit
         AFTER UPDATE ON orders
         BEGIN
           INSERT INTO trigger_audit (order_id, version) VALUES (NEW.id, NEW.version);
         END`,
      )
      .run();

    const results = await db.batch([
      db
        .prepare(
          "UPDATE orders SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
        )
        .bind(now, "order-a", 1),
      db
        .prepare(
          "INSERT INTO changes (hub_id, order_id, version, op, changed_at) VALUES ('hub-1', 'order-a', 2, 'upsert', ?)",
        )
        .bind(now),
    ]);

    expect(results[0]?.meta.changes).toBe(2);
    expect(results[1]?.meta.changes).toBe(1);

    const audit = await db
      .prepare("SELECT order_id, version FROM trigger_audit")
      .all<{ order_id: string; version: number }>();

    expect(audit.results).toEqual([{ order_id: "order-a", version: 2 }]);
  });

  it("aborts and rolls back the batch when a trigger raises", async () => {
    await seedOrder(db, {
      id: "order-b",
      customerId: "cust-a",
      slotId: "slot-other",
      version: 2,
    });
    await db
      .prepare(
        `CREATE TRIGGER trg_guard
         BEFORE UPDATE ON orders
         WHEN NEW.version > 2
         BEGIN
           SELECT RAISE(ABORT, 'guarded');
         END`,
      )
      .run();

    await expect(
      db.batch([
        db
          .prepare(
            "UPDATE orders SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
          )
          .bind(now, "order-b", 2),
        db
          .prepare(
            "INSERT INTO changes (hub_id, order_id, version, op, changed_at) VALUES ('hub-1', 'order-b', 3, 'upsert', ?)",
          )
          .bind(now),
      ]),
    ).rejects.toThrow(/guarded/);

    const order = await db
      .prepare("SELECT version FROM orders WHERE id = ?")
      .bind("order-b")
      .first<{ version: number }>();
    const changes = await db
      .prepare("SELECT COUNT(*) AS count FROM changes")
      .first<{ count: number }>();

    expect(order?.version).toBe(2);
    expect(changes?.count).toBe(0);
  });

  it("supports UPDATE RETURNING", async () => {
    const row = await db
      .prepare(
        "UPDATE orders SET version = version + 1, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
      )
      .bind(now, "order-a", 1)
      .first<{ version: number }>();

    expect(row?.version).toBe(2);
  });
});
