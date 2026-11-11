export const TEST_TENANT = "tenant-1";
export const TEST_HUB = "hub-1";
export const OTHER_HUB = "hub-2";

export async function clearLaundryData(db: D1Database): Promise<void> {
  const tables = [
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
}

export async function seedLaundryReadFixtures(db: D1Database): Promise<void> {
  await db
    .prepare("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)")
    .bind(TEST_TENANT, "Test Tenant", 1)
    .run();
  await db
    .prepare(
      "INSERT INTO hubs (id, tenant_id, name, timezone, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(TEST_HUB, TEST_TENANT, "Main Hub", "Asia/Kolkata", 1)
    .run();
  await db
    .prepare(
      "INSERT INTO hubs (id, tenant_id, name, timezone, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(OTHER_HUB, TEST_TENANT, "Second Hub", "Asia/Kolkata", 1)
    .run();

  await db
    .prepare(
      "INSERT INTO customers (id, hub_id, name, phone, phone_normalized, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("cust-1", TEST_HUB, "Alice", "+919000000001", "9000000001", null, 1000, 1000)
    .run();
  await db
    .prepare(
      "INSERT INTO customers (id, hub_id, name, phone, phone_normalized, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("cust-2", TEST_HUB, "Bob", "+919000000002", "9000000002", "Call first", 2000, 2000)
    .run();
  await db
    .prepare(
      "INSERT INTO customers (id, hub_id, name, phone, phone_normalized, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("cust-3", OTHER_HUB, "Zed", "+919000000003", "9000000003", null, 1500, 1500)
    .run();

  await db
    .prepare(
      "INSERT INTO orders (id, hub_id, customer_id, status, service_type, delivery_slot_id, delivery_at, version, last_mutation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("order-1", TEST_HUB, "cust-1", "confirmed", "wash_fold", null, 5000, 1, "seed-1", 1000, 1000)
    .run();
  await db
    .prepare(
      "INSERT INTO orders (id, hub_id, customer_id, status, service_type, delivery_slot_id, delivery_at, version, last_mutation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("order-2", TEST_HUB, "cust-2", "processing", "dry_clean", null, 6000, 2, "seed-2", 2000, 2000)
    .run();
  await db
    .prepare(
      "INSERT INTO orders (id, hub_id, customer_id, status, service_type, delivery_slot_id, delivery_at, version, last_mutation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("order-3", OTHER_HUB, "cust-3", "confirmed", "wash_fold", null, 5500, 1, "seed-3", 1500, 1500)
    .run();

  await db
    .prepare(
      "INSERT INTO order_items (id, hub_id, order_id, description, quantity, service_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("item-1", TEST_HUB, "order-1", "Shirt", 2, "wash_fold", 1000)
    .run();
  await db
    .prepare(
      "INSERT INTO order_items (id, hub_id, order_id, description, quantity, service_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("item-2", TEST_HUB, "order-2", "Blanket", 1, "dry_clean", 2000)
    .run();
  await db
    .prepare(
      "INSERT INTO order_items (id, hub_id, order_id, description, quantity, service_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("item-3", OTHER_HUB, "order-3", "Saree", 1, "wash_fold", 1500)
    .run();
}
