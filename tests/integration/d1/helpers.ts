export const CAPACITY_STATUSES =
  "('confirmed','processing','hold','out_for_delivery')";

export type GuardedUpdateInput = {
  orderId: string;
  hubId: string;
  mutationId: string;
  payloadHash: string;
  baseVersion: number;
  slotId: string;
  deliveryAt: number;
  status: string;
  now: number;
  eventId: string;
  calendarOutboxId: string;
  notificationOutboxId: string;
  actorId: string;
};

export type GuardedCreateInput = {
  orderId: string;
  hubId: string;
  customerId: string;
  serviceType: string;
  slotId: string;
  deliveryAt: number;
  mutationId: string;
  payloadHash: string;
  now: number;
  eventId: string;
  calendarOutboxId: string;
  notificationOutboxId: string;
  actorId: string;
};

export async function createSchema(db: D1Database): Promise<void> {
  const statements = [
    `DROP TABLE IF EXISTS outbox`,
    `DROP TABLE IF EXISTS changes`,
    `DROP TABLE IF EXISTS order_events`,
    `DROP TABLE IF EXISTS orders`,
    `DROP TABLE IF EXISTS delivery_slots`,
    `DROP TABLE IF EXISTS customers`,
    `DROP TABLE IF EXISTS hubs`,
    `CREATE TABLE hubs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      hub_id TEXT NOT NULL REFERENCES hubs(id),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone_normalized TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (hub_id, phone_normalized)
    )`,
    `CREATE TABLE delivery_slots (
      id TEXT PRIMARY KEY,
      hub_id TEXT NOT NULL REFERENCES hubs(id),
      slot_key TEXT NOT NULL,
      local_date TEXT NOT NULL,
      local_start TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      UNIQUE (hub_id, slot_key)
    )`,
    `CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      hub_id TEXT NOT NULL REFERENCES hubs(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      status TEXT NOT NULL CHECK (status IN (
        'confirmed','processing','hold','out_for_delivery','delivered','cancelled'
      )),
      service_type TEXT NOT NULL,
      delivery_slot_id TEXT REFERENCES delivery_slots(id),
      delivery_at INTEGER,
      version INTEGER NOT NULL DEFAULT 1,
      last_mutation_id TEXT NOT NULL,
      last_notified_delivery_at INTEGER,
      hold_comment TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      cancelled_at INTEGER
    )`,
    `CREATE TABLE order_events (
      id TEXT PRIMARY KEY,
      hub_id TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(id),
      mutation_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('app','calendar','system')),
      actor_type TEXT NOT NULL CHECK (actor_type IN ('user','service','system')),
      actor_id TEXT,
      previous_version INTEGER NOT NULL,
      new_version INTEGER NOT NULL,
      at INTEGER NOT NULL,
      detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
      UNIQUE (hub_id, mutation_id)
    )`,
    `CREATE TABLE changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hub_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
      changed_at INTEGER NOT NULL,
      UNIQUE (hub_id, order_id, version)
    )`,
    `CREATE TABLE outbox (
      id TEXT PRIMARY KEY,
      hub_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      destination TEXT NOT NULL CHECK (destination IN ('calendar','notification')),
      operation TEXT NOT NULL,
      target_version INTEGER NOT NULL,
      mutation_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','dispatching','done','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL,
      lease_token TEXT,
      lease_expires_at INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      UNIQUE (order_id, destination, operation, target_version)
    )`,
  ];

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}
export async function resetData(db: D1Database): Promise<void> {
  const statements = [
    "DELETE FROM outbox",
    "DELETE FROM changes",
    "DELETE FROM order_events",
    "DELETE FROM orders",
    "DELETE FROM delivery_slots",
    "DELETE FROM customers",
    "DELETE FROM hubs",
  ];

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

export async function seedHub(db: D1Database): Promise<void> {
  const now = 1_700_000_000_000;
  await db
    .prepare(
      "INSERT INTO hubs (id, tenant_id, name, timezone, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind("hub-1", "tenant-1", "Hub One", "Asia/Kolkata", now)
    .run();
}

export async function seedCustomer(
  db: D1Database,
  id: string,
): Promise<void> {
  const now = 1_700_000_000_000;
  await db
    .prepare(
      `INSERT INTO customers
        (id, hub_id, name, phone, phone_normalized, created_at, updated_at)
       VALUES (?, 'hub-1', ?, ?, ?, ?, ?)`,
    )
    .bind(id, id, `+91900000000${id.slice(-1)}`, `90000000${id.slice(-1)}`, now, now)
    .run();
}

export async function seedSlot(
  db: D1Database,
  input: {
    id: string;
    slotKey: string;
    capacity: number;
    localDate?: string;
    startsAt?: number;
  },
): Promise<void> {
  const now = 1_700_000_000_000;
  await db
    .prepare(
      `INSERT INTO delivery_slots
        (id, hub_id, slot_key, local_date, local_start, starts_at, ends_at, capacity, active, created_at)
       VALUES (?, 'hub-1', ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .bind(
      input.id,
      input.slotKey,
      input.localDate ?? "2026-11-12",
      "17:00",
      input.startsAt ?? now + 86_400_000,
      (input.startsAt ?? now + 86_400_000) + 7_200_000,
      input.capacity,
      now,
    )
    .run();
}

export async function seedOrder(
  db: D1Database,
  input: {
    id: string;
    customerId: string;
    slotId: string;
    status?: string;
    version?: number;
    lastMutationId?: string;
  },
): Promise<void> {
  const now = 1_700_000_000_000;
  await db
    .prepare(
      `INSERT INTO orders
        (id, hub_id, customer_id, status, service_type, delivery_slot_id, delivery_at,
         version, last_mutation_id, last_notified_delivery_at, created_at, updated_at)
       VALUES (?, 'hub-1', ?, ?, 'wash_fold', ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      input.id,
      input.customerId,
      input.status ?? "confirmed",
      input.slotId,
      now + 86_400_000,
      input.version ?? 1,
      input.lastMutationId ?? `seed-${input.id}`,
      now,
      now,
    )
    .run();
}

export async function counts(db: D1Database): Promise<{
  events: number;
  changes: number;
  outbox: number;
}> {
  const row = await db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM order_events) AS events,
        (SELECT COUNT(*) FROM changes) AS changes,
        (SELECT COUNT(*) FROM outbox) AS outbox`,
    )
    .first<{ events: number; changes: number; outbox: number }>();

  if (!row) {
    throw new Error("counts query returned no row");
  }

  return row;
}

export function guardedUpdateStatements(
  db: D1Database,
  input: GuardedUpdateInput,
): D1PreparedStatement[] {
  const newVersion = input.baseVersion + 1;

  const update = db
    .prepare(
      `UPDATE orders
       SET delivery_slot_id = ?, delivery_at = ?, status = ?,
           last_mutation_id = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND hub_id = ? AND version = ?
         AND NOT EXISTS (
           SELECT 1 FROM order_events WHERE hub_id = ? AND mutation_id = ?
         )
         AND (
           SELECT COUNT(*) FROM orders o
           WHERE o.hub_id = ?
             AND o.delivery_slot_id = ?
             AND o.status IN ${CAPACITY_STATUSES}
             AND o.id <> ?
         ) < (
           SELECT capacity FROM delivery_slots
           WHERE hub_id = ? AND id = ? AND active = 1
         )`,
    )
    .bind(
      input.slotId,
      input.deliveryAt,
      input.status,
      input.mutationId,
      input.now,
      input.orderId,
      input.hubId,
      input.baseVersion,
      input.hubId,
      input.mutationId,
      input.hubId,
      input.slotId,
      input.orderId,
      input.hubId,
      input.slotId,
    );

  const event = db
    .prepare(
      `INSERT OR IGNORE INTO order_events
        (id, hub_id, order_id, mutation_id, payload_hash, event_type,
         source, actor_type, actor_id, previous_version, new_version, at, detail_json)
       SELECT ?, ?, id, ?, ?, 'reschedule', 'app', 'user', ?, ?, version, ?, ?
       FROM orders
       WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?`,
    )
    .bind(
      input.eventId,
      input.hubId,
      input.mutationId,
      input.payloadHash,
      input.actorId,
      input.baseVersion,
      input.now,
      "{}",
      input.orderId,
      input.hubId,
      newVersion,
      input.mutationId,
    );

  const change = db
    .prepare(
      `INSERT OR IGNORE INTO changes (hub_id, order_id, version, op, changed_at)
       SELECT hub_id, id, version, 'upsert', ?
       FROM orders
       WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?`,
    )
    .bind(input.now, input.orderId, input.hubId, newVersion, input.mutationId);

  const calendarOutbox = db
    .prepare(
      `INSERT OR IGNORE INTO outbox
        (id, hub_id, order_id, destination, operation, target_version,
         mutation_id, status, attempts, next_attempt_at, created_at)
       SELECT ?, hub_id, id, 'calendar', 'UPSERT_EVENT', version, ?,
              'pending', 0, ?, ?
       FROM orders
       WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?`,
    )
    .bind(
      input.calendarOutboxId,
      input.mutationId,
      input.now,
      input.now,
      input.orderId,
      input.hubId,
      newVersion,
      input.mutationId,
    );

  const notificationOutbox = db
    .prepare(
      `INSERT OR IGNORE INTO outbox
        (id, hub_id, order_id, destination, operation, target_version,
         mutation_id, status, attempts, next_attempt_at, created_at)
       SELECT ?, hub_id, id, 'notification', 'SEND_STATUS', version, ?,
              'pending', 0, ?, ?
       FROM orders
       WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?`,
    )
    .bind(
      input.notificationOutboxId,
      input.mutationId,
      input.now,
      input.now,
      input.orderId,
      input.hubId,
      newVersion,
      input.mutationId,
    );

  return [update, event, change, calendarOutbox, notificationOutbox];
}

export function guardedCreateStatements(
  db: D1Database,
  input: GuardedCreateInput,
): D1PreparedStatement[] {
  const insert = db
    .prepare(
      `INSERT OR IGNORE INTO orders
        (id, hub_id, customer_id, status, service_type, delivery_slot_id,
         delivery_at, version, last_mutation_id, last_notified_delivery_at,
         created_at, updated_at)
       SELECT ?, ?, ?, 'confirmed', ?, ?, ?, 1, ?, NULL, ?, ?
       WHERE (
         SELECT COUNT(*) FROM orders
         WHERE hub_id = ? AND delivery_slot_id = ?
           AND status IN ${CAPACITY_STATUSES}
       ) < (
         SELECT capacity FROM delivery_slots
         WHERE hub_id = ? AND id = ? AND active = 1
       )`,
    )
    .bind(
      input.orderId,
      input.hubId,
      input.customerId,
      input.serviceType,
      input.slotId,
      input.deliveryAt,
      input.mutationId,
      input.now,
      input.now,
      input.hubId,
      input.slotId,
      input.hubId,
      input.slotId,
    );

  const event = db
    .prepare(
      `INSERT OR IGNORE INTO order_events
        (id, hub_id, order_id, mutation_id, payload_hash, event_type,
         source, actor_type, actor_id, previous_version, new_version, at, detail_json)
       SELECT ?, ?, id, ?, ?, 'createOrder', 'app', 'user', ?, 0, version, ?, ?
       FROM orders
       WHERE id = ? AND hub_id = ? AND version = 1 AND last_mutation_id = ?`,
    )
    .bind(
      input.eventId,
      input.hubId,
      input.mutationId,
      input.payloadHash,
      input.actorId,
      input.now,
      "{}",
      input.orderId,
      input.hubId,
      input.mutationId,
    );

  const change = db
    .prepare(
      `INSERT OR IGNORE INTO changes (hub_id, order_id, version, op, changed_at)
       SELECT hub_id, id, version, 'upsert', ?
       FROM orders
       WHERE id = ? AND hub_id = ? AND version = 1 AND last_mutation_id = ?`,
    )
    .bind(input.now, input.orderId, input.hubId, input.mutationId);

  const calendarOutbox = db
    .prepare(
      `INSERT OR IGNORE INTO outbox
        (id, hub_id, order_id, destination, operation, target_version,
         mutation_id, status, attempts, next_attempt_at, created_at)
       SELECT ?, hub_id, id, 'calendar', 'UPSERT_EVENT', version, ?,
              'pending', 0, ?, ?
       FROM orders
       WHERE id = ? AND hub_id = ? AND version = 1 AND last_mutation_id = ?`,
    )
    .bind(
      input.calendarOutboxId,
      input.mutationId,
      input.now,
      input.now,
      input.orderId,
      input.hubId,
      input.mutationId,
    );

  const notificationOutbox = db
    .prepare(
      `INSERT OR IGNORE INTO outbox
        (id, hub_id, order_id, destination, operation, target_version,
         mutation_id, status, attempts, next_attempt_at, created_at)
       SELECT ?, hub_id, id, 'notification', 'SEND_STATUS', version, ?,
              'pending', 0, ?, ?
       FROM orders
       WHERE id = ? AND hub_id = ? AND version = 1 AND last_mutation_id = ?`,
    )
    .bind(
      input.notificationOutboxId,
      input.mutationId,
      input.now,
      input.now,
      input.orderId,
      input.hubId,
      input.mutationId,
    );

  return [insert, event, change, calendarOutbox, notificationOutbox];
}
