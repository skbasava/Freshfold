import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

type LaundryTestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as LaundryTestEnv;
const db = testEnv.LAUNDRY_DB;
const now = 1_700_000_000_000;

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  const tables = [
    "employee_hub_memberships",
    "employees",
    "calendar_repairs",
    "notifications",
    "sync_state",
    "calendar_sync",
    "outbox",
    "changes",
    "order_events",
    "order_items",
    "orders",
    "delivery_slots",
    "customers",
    "hubs",
    "tenants",
  ];
  for (const table of tables) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
});

async function seedOrderGraph(): Promise<void> {
  await db
    .prepare("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)")
    .bind("tenant-1", "Tenant One", now)
    .run();
  await db
    .prepare(
      "INSERT INTO hubs (id, tenant_id, name, timezone, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind("hub-1", "tenant-1", "Hub One", "Asia/Kolkata", now)
    .run();
  await db
    .prepare(
      `INSERT INTO customers
        (id, hub_id, name, phone, phone_normalized, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind("cust-1", "hub-1", "Customer One", "+919000000001", "9000000001", now, now)
    .run();
  await db
    .prepare(
      `INSERT INTO orders
        (id, hub_id, customer_id, status, service_type, version,
         last_mutation_id, created_at, updated_at)
       VALUES (?, ?, ?, 'confirmed', 'wash_fold', 1, ?, ?, ?)`,
    )
    .bind("order-1", "hub-1", "cust-1", "seed-order-1", now, now)
    .run();
}

describe("laundry migrations", () => {
  it("applies the core tables and indexes from an empty database", async () => {
    const tables = await db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations'
         ORDER BY name`,
      )
      .all<{ name: string }>();

    expect(tables.results.map((row) => row.name)).toEqual([
      "calendar_repairs",
      "calendar_sync",
      "changes",
      "customers",
      "delivery_slots",
      "employee_hub_memberships",
      "employees",
      "hubs",
      "notifications",
      "order_events",
      "order_items",
      "orders",
      "outbox",
      "sync_state",
      "tenants",
    ]);

    const indexes = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
      )
      .all<{ name: string }>();
    const names = indexes.results.map((row) => row.name);

    expect(names).toContain("idx_changes_hub_cursor");
    expect(names).toContain("idx_order_events_hub_mutation");
    expect(names).toContain("idx_outbox_claim");
    expect(names).toContain("idx_order_items_hub_order");
  });

  it("keeps hub scope on order items and foreign keys on orders", async () => {
    const itemColumns = await db
      .prepare("PRAGMA table_info(order_items)")
      .all<{ name: string }>();

    expect(itemColumns.results.map((row) => row.name)).toContain("hub_id");

    const orderColumns = await db
      .prepare("PRAGMA table_info(orders)")
      .all<{ name: string }>();
    expect(orderColumns.results.map((row) => row.name)).toContain(
      "hold_comment",
    );

    const orderForeignKeys = await db
      .prepare("PRAGMA foreign_key_list(orders)")
      .all<{ table: string }>();
    const referenced = orderForeignKeys.results.map((row) => row.table);

    expect(referenced).toEqual(
      expect.arrayContaining(["customers", "delivery_slots", "hubs"]),
    );
  });

  it("accepts hold and rejects removed statuses", async () => {
    await seedOrderGraph();

    await db
      .prepare(
        `INSERT INTO orders
          (id, hub_id, customer_id, status, service_type, version,
           last_mutation_id, created_at, updated_at)
         VALUES (?, ?, ?, 'hold', 'wash_fold', 1, ?, ?, ?)`,
      )
      .bind("order-hold", "hub-1", "cust-1", "seed-hold", now, now)
      .run();

    await expect(
      db
        .prepare(
          `INSERT INTO orders
            (id, hub_id, customer_id, status, service_type, version,
             last_mutation_id, created_at, updated_at)
           VALUES (?, ?, ?, 'created', 'wash_fold', 1, ?, ?, ?)`,
        )
        .bind("order-created", "hub-1", "cust-1", "seed-created", now, now)
        .run(),
    ).rejects.toThrow();
  });

  it("enforces unique changes per order version", async () => {
    await db
      .prepare(
        "INSERT INTO changes (hub_id, order_id, version, op, changed_at) VALUES (?, ?, ?, 'upsert', ?)",
      )
      .bind("hub-1", "order-1", 1, now)
      .run();

    await expect(
      db
        .prepare(
          "INSERT INTO changes (hub_id, order_id, version, op, changed_at) VALUES (?, ?, ?, 'upsert', ?)",
        )
        .bind("hub-1", "order-1", 1, now)
        .run(),
    ).rejects.toThrow();
  });

  it("rejects invalid JSON detail on order events", async () => {
    await seedOrderGraph();

    await db
      .prepare(
        `INSERT INTO order_events
          (id, hub_id, order_id, mutation_id, payload_hash, event_type,
           source, actor_type, actor_id, previous_version, new_version, at, detail_json)
         VALUES (?, ?, ?, ?, ?, 'createOrder', 'app', 'user', ?, 0, 1, ?, '{}')`,
      )
      .bind(
        "event-valid",
        "hub-1",
        "order-1",
        "mut-valid",
        "hash-valid",
        "user-desk",
        now,
      )
      .run();

    await expect(
      db
        .prepare(
          `INSERT INTO order_events
            (id, hub_id, order_id, mutation_id, payload_hash, event_type,
             source, actor_type, actor_id, previous_version, new_version, at, detail_json)
           VALUES (?, ?, ?, ?, ?, 'createOrder', 'app', 'user', ?, 0, 1, ?, 'not-json')`,
        )
        .bind(
          "event-invalid",
          "hub-1",
          "order-1",
          "mut-invalid",
          "hash-invalid",
          "user-desk",
          now,
        )
        .run(),
    ).rejects.toThrow();
  });
});
