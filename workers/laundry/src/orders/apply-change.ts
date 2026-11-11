import type { InternalContext } from "../../../../packages/contracts/src/auth";
import {
  applyChangeInputSchema,
  type ApplyChangeInput,
  type ApplyChangeResult,
} from "../../../../packages/contracts/src/mutations";
import {
  orderStatusSchema,
  type OrderDetail,
  type OrderStatus,
} from "../../../../packages/contracts/src/orders";
import {
  deriveCustomerId,
  normalizePhone,
} from "../../../../packages/contracts/src/phone";
import { can } from "../../../../packages/domain/src/permissions";
import {
  CAPACITY_STATUS_SQL,
  findActiveSlot,
  isSlotFull,
  validateSlotTiming,
  type CapacitySlot,
} from "../capacity";
import { permissionForIntent } from "../domain/intents";
import { nextStatus, type UpdateIntent } from "../domain/state-machine";
import { hashPayload } from "./idempotency";
import { getOrder } from "./read";

type OrderRow = {
  id: string;
  hub_id: string;
  customer_id: string;
  status: string;
  service_type: string;
  delivery_slot_id: string | null;
  delivery_at: number | null;
  version: number;
  last_mutation_id: string;
  hold_comment: string | null;
  created_at: number;
  updated_at: number;
  cancelled_at: number | null;
};

type EventRow = {
  payload_hash: string;
  event_type: string;
  detail_json: string;
};

type CustomerRow = {
  id: string;
  hub_id: string;
  name: string;
  phone: string;
  phone_normalized: string;
};

type ResolvedCustomer = {
  id: string;
  name: string;
  phone: string;
  phoneNormalized: string;
};

export type ApplyChangeErrorCode =
  | "INVALID_REQUEST"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ORDER_EXISTS"
  | "VERSION_CONFLICT"
  | "MUTATION_PAYLOAD_MISMATCH"
  | "INVALID_TRANSITION"
  | "INVALID_CUSTOMER"
  | "INVALID_SLOT"
  | "SLOT_FULL"
  | "INTERNAL_ERROR";

export class ApplyChangeError extends Error {
  constructor(
    readonly code: ApplyChangeErrorCode,
    readonly status: 400 | 403 | 404 | 409 | 422 | 500,
    readonly currentOrder?: OrderDetail,
  ) {
    super(code);
    this.name = "ApplyChangeError";
  }
}

type ApplyOptions = {
  now?: number;
};

export async function applyChange(
  db: D1Database,
  actor: InternalContext,
  input: ApplyChangeInput,
  options: ApplyOptions = {},
): Promise<ApplyChangeResult> {
  const parsed = applyChangeInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplyChangeError("INVALID_REQUEST", 400);
  }

  const data = parsed.data;
  if (!can(actor.role, permissionForIntent(data.intent))) {
    throw new ApplyChangeError("FORBIDDEN", 403);
  }

  const now = options.now ?? Date.now();
  const payloadHash = await hashPayload({
    orderId: data.orderId,
    intent: data.intent,
    payload: data.payload,
  });
  const existingEvent = await findEvent(db, actor.hubId, data.mutationId);

  if (existingEvent) {
    if (existingEvent.payload_hash !== payloadHash) {
      throw new ApplyChangeError("MUTATION_PAYLOAD_MISMATCH", 409);
    }

    const order = await getOrder(db, actor.hubId, data.orderId);
    if (!order) {
      throw new ApplyChangeError("NOT_FOUND", 404);
    }

    return {
      order,
      replayed: true,
      customerCreated: replayCustomerCreated(existingEvent),
    };
  }

  if (data.intent === "createOrder") {
    return createOrder(db, actor, data, payloadHash, now);
  }

  return updateOrder(db, actor, data, payloadHash, now);
}

async function createOrder(
  db: D1Database,
  actor: InternalContext,
  data: Extract<ApplyChangeInput, { intent: "createOrder" }>,
  payloadHash: string,
  now: number,
): Promise<ApplyChangeResult> {
  const current = await findOrder(db, actor.hubId, data.orderId);
  if (current) {
    throw new ApplyChangeError("ORDER_EXISTS", 409);
  }

  const customer = await resolveCreateCustomer(
    db,
    actor.hubId,
    data.payload,
  );

  const slot = await findActiveSlot(db, actor.hubId, data.payload.deliverySlotId);
  if (!slot || validateSlotTiming(slot, now)) {
    throw new ApplyChangeError("INVALID_SLOT", 422);
  }

  const newVersion = 1;
  const eventId = crypto.randomUUID();
  const calendarOutboxId = crypto.randomUUID();
  const notificationOutboxId = crypto.randomUUID();
  const detail = {
    intent: data.intent,
    payload: data.payload,
    previousStatus: null,
    newStatus: "confirmed",
    customerCreated: false,
  };
  const detailJson = JSON.stringify(detail);
  const source = sourceForActor(actor);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT OR IGNORE INTO customers (
          id, hub_id, name, phone, phone_normalized, notes, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, NULL, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM orders WHERE id = ? AND hub_id = ?
        )
          AND NOT EXISTS (
            SELECT 1 FROM order_events WHERE hub_id = ? AND mutation_id = ?
          )
          AND (
            SELECT COUNT(*) FROM orders
            WHERE hub_id = ? AND delivery_slot_id = ?
              AND status IN ${CAPACITY_STATUS_SQL}
          ) < (
            SELECT capacity FROM delivery_slots
            WHERE hub_id = ? AND id = ? AND active = 1
          )`,
      )
      .bind(
        customer.id,
        actor.hubId,
        customer.name,
        customer.phone,
        customer.phoneNormalized,
        now,
        now,
        data.orderId,
        actor.hubId,
        actor.hubId,
        data.mutationId,
        actor.hubId,
        slot.id,
        actor.hubId,
        slot.id,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO orders (
          id, hub_id, customer_id, status, service_type, delivery_slot_id,
          delivery_at, version, last_mutation_id, last_notified_delivery_at,
          created_at, updated_at
        )
        SELECT ?, ?, ?, 'confirmed', ?, ?, ?, 1, ?, NULL, ?, ?
        WHERE (
          SELECT COUNT(*) FROM orders
          WHERE hub_id = ? AND delivery_slot_id = ?
            AND status IN ${CAPACITY_STATUS_SQL}
        ) < (
          SELECT capacity FROM delivery_slots
          WHERE hub_id = ? AND id = ? AND active = 1
        )
          AND EXISTS (
            SELECT 1 FROM customers WHERE id = ? AND hub_id = ?
          )`,
      )
      .bind(
        data.orderId,
        actor.hubId,
        customer.id,
        data.payload.serviceType,
        slot.id,
        slot.starts_at,
        data.mutationId,
        now,
        now,
        actor.hubId,
        slot.id,
        actor.hubId,
        slot.id,
        customer.id,
        actor.hubId,
      ),
  ];

  data.payload.items.forEach((item, index) => {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO order_items (
            id, hub_id, order_id, description, quantity, service_type, created_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM orders
            WHERE id = ? AND hub_id = ? AND version = 1 AND last_mutation_id = ?
          )`,
        )
        .bind(
          `${data.orderId}:item:${index}`,
          actor.hubId,
          data.orderId,
          item.description,
          item.quantity,
          item.serviceType ?? null,
          now,
          data.orderId,
          actor.hubId,
          data.mutationId,
        ),
    );
  });

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO order_events (
          id, hub_id, order_id, mutation_id, payload_hash, event_type,
          source, actor_type, actor_id, previous_version, new_version, at, detail_json
        )
        SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, 0, version, ?, ?
        FROM orders
        WHERE id = ? AND hub_id = ? AND version = 1 AND last_mutation_id = ?`,
      )
      .bind(
        eventId,
        actor.hubId,
        data.mutationId,
        payloadHash,
        data.intent,
        source,
        actor.actorType,
        actor.actorId,
        now,
        detailJson,
        data.orderId,
        actor.hubId,
        data.mutationId,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO changes (hub_id, order_id, version, op, changed_at)
         SELECT hub_id, id, version, 'upsert', ?
         FROM orders
         WHERE id = ? AND hub_id = ? AND version = 1 AND last_mutation_id = ?`,
      )
      .bind(now, data.orderId, actor.hubId, data.mutationId),
    calendarOutboxStatement(
      db,
      actor.hubId,
      data.orderId,
      data.mutationId,
      newVersion,
      calendarOutboxId,
      now,
    ),
    notificationOutboxStatement(
      db,
      actor.hubId,
      data.orderId,
      data.mutationId,
      newVersion,
      notificationOutboxId,
      now,
    ),
  );

  const results = await db.batch(statements);
  const customerCreated = changesFor(results, 0) === 1;
  if (changesFor(results, 1) === 1) {
    if (customerCreated) {
      await db
        .prepare(
          `UPDATE order_events SET detail_json = ?
           WHERE hub_id = ? AND mutation_id = ? AND order_id = ?`,
        )
        .bind(
          JSON.stringify({ ...detail, customerCreated: true }),
          actor.hubId,
          data.mutationId,
          data.orderId,
        )
        .run();
    }
    return canonicalResult(db, actor.hubId, data.orderId, customerCreated);
  }

  if (customerCreated) {
    // Defensive compensation: this batch inserted the customer, but no order
    // was accepted. Remove it only when nothing else references it.
    await db
      .prepare(
        `DELETE FROM customers
         WHERE id = ? AND hub_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM orders WHERE customer_id = ? AND hub_id = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM order_events WHERE hub_id = ? AND mutation_id = ?
           )`,
      )
      .bind(
        customer.id,
        actor.hubId,
        customer.id,
        actor.hubId,
        actor.hubId,
        data.mutationId,
      )
      .run();
  }

  return classifyNoWrite(db, actor, data, payloadHash, slot, null);
}

async function updateOrder(
  db: D1Database,
  actor: InternalContext,
  data: Exclude<ApplyChangeInput, { intent: "createOrder" }>,
  payloadHash: string,
  now: number,
): Promise<ApplyChangeResult> {
  const current = await findOrder(db, actor.hubId, data.orderId);
  if (!current) {
    throw new ApplyChangeError("NOT_FOUND", 404);
  }

  if (current.version !== data.baseVersion) {
    throw new ApplyChangeError(
      "VERSION_CONFLICT",
      409,
      await requireOrder(db, actor.hubId, data.orderId),
    );
  }

  const currentStatus = orderStatusSchema.parse(current.status) as OrderStatus;
  const targetStatus = nextStatus(currentStatus, data.intent as UpdateIntent);
  if (!targetStatus) {
    throw new ApplyChangeError("INVALID_TRANSITION", 422);
  }

  let slot: CapacitySlot | null = null;
  if (data.intent === "reschedule") {
    slot = await findActiveSlot(db, actor.hubId, data.payload.deliverySlotId);
    if (!slot || validateSlotTiming(slot, now)) {
      throw new ApplyChangeError("INVALID_SLOT", 422);
    }
  }

  const newVersion = current.version + 1;
  const eventId = crypto.randomUUID();
  const calendarOutboxId = crypto.randomUUID();
  const notificationOutboxId = crypto.randomUUID();
  const detailJson = JSON.stringify({
    intent: data.intent,
    payload: data.payload,
    previousStatus: currentStatus,
    newStatus: targetStatus,
  });
  const source = sourceForActor(actor);
  const statements: D1PreparedStatement[] = [
    updateStatement(db, actor.hubId, data, current, slot, targetStatus, now),
  ];

  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO order_events (
          id, hub_id, order_id, mutation_id, payload_hash, event_type,
          source, actor_type, actor_id, previous_version, new_version, at, detail_json
        )
        SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, ?, version, ?, ?
        FROM orders
        WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?`,
      )
      .bind(
        eventId,
        actor.hubId,
        data.mutationId,
        payloadHash,
        data.intent,
        source,
        actor.actorType,
        actor.actorId,
        current.version,
        now,
        detailJson,
        data.orderId,
        actor.hubId,
        newVersion,
        data.mutationId,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO changes (hub_id, order_id, version, op, changed_at)
         SELECT hub_id, id, version, 'upsert', ?
         FROM orders
         WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?`,
      )
      .bind(now, data.orderId, actor.hubId, newVersion, data.mutationId),
    calendarOutboxStatement(
      db,
      actor.hubId,
      data.orderId,
      data.mutationId,
      newVersion,
      calendarOutboxId,
      now,
    ),
    notificationOutboxStatement(
      db,
      actor.hubId,
      data.orderId,
      data.mutationId,
      newVersion,
      notificationOutboxId,
      now,
    ),
  );

  const results = await db.batch(statements);
  if (changesFor(results, 0) === 1) {
    return canonicalResult(db, actor.hubId, data.orderId, false);
  }

  return classifyNoWrite(db, actor, data, payloadHash, slot, current);
}

function updateStatement(
  db: D1Database,
  hubId: string,
  data: Exclude<ApplyChangeInput, { intent: "createOrder" }>,
  current: OrderRow,
  slot: CapacitySlot | null,
  targetStatus: OrderStatus,
  now: number,
): D1PreparedStatement {
  const replayGuard = `NOT EXISTS (
    SELECT 1 FROM order_events WHERE hub_id = ? AND mutation_id = ?
  )`;

  if (data.intent === "reschedule") {
    return db
      .prepare(
        `UPDATE orders
         SET delivery_slot_id = ?, delivery_at = ?, last_mutation_id = ?,
             version = version + 1, updated_at = ?
         WHERE id = ? AND hub_id = ? AND version = ?
           AND ${replayGuard}
           AND (
             SELECT COUNT(*) FROM orders o
             WHERE o.hub_id = ? AND o.delivery_slot_id = ?
               AND o.status IN ${CAPACITY_STATUS_SQL}
               AND o.id <> ?
           ) < (
             SELECT capacity FROM delivery_slots
             WHERE hub_id = ? AND id = ? AND active = 1
           )`,
      )
      .bind(
        slot!.id,
        slot!.starts_at,
        data.mutationId,
        now,
        data.orderId,
        hubId,
        current.version,
        hubId,
        data.mutationId,
        hubId,
        slot!.id,
        data.orderId,
        hubId,
        slot!.id,
      );
  }

  if (data.intent === "cancel") {
    return db
      .prepare(
        `UPDATE orders
         SET status = 'cancelled', delivery_slot_id = NULL, delivery_at = NULL,
             cancelled_at = ?, hold_comment = NULL, last_mutation_id = ?,
             version = version + 1, updated_at = ?
         WHERE id = ? AND hub_id = ? AND version = ?
           AND ${replayGuard}`,
      )
      .bind(
        now,
        data.mutationId,
        now,
        data.orderId,
        hubId,
        current.version,
        hubId,
        data.mutationId,
      );
  }

  if (data.intent === "placeOnHold") {
    return db
      .prepare(
        `UPDATE orders
         SET status = 'hold', hold_comment = ?, last_mutation_id = ?,
             version = version + 1, updated_at = ?
         WHERE id = ? AND hub_id = ? AND version = ?
           AND ${replayGuard}`,
      )
      .bind(
        data.payload.comments,
        data.mutationId,
        now,
        data.orderId,
        hubId,
        current.version,
        hubId,
        data.mutationId,
      );
  }

  if (data.intent === "releaseHold") {
    return db
      .prepare(
        `UPDATE orders
         SET status = 'processing', hold_comment = NULL, last_mutation_id = ?,
             version = version + 1, updated_at = ?
         WHERE id = ? AND hub_id = ? AND version = ?
           AND ${replayGuard}`,
      )
      .bind(
        data.mutationId,
        now,
        data.orderId,
        hubId,
        current.version,
        hubId,
        data.mutationId,
      );
  }

  return db
    .prepare(
      `UPDATE orders
       SET status = ?, last_mutation_id = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND hub_id = ? AND version = ?
         AND ${replayGuard}`,
    )
    .bind(
      targetStatus,
      data.mutationId,
      now,
      data.orderId,
      hubId,
      current.version,
      hubId,
      data.mutationId,
    );
}

function calendarOutboxStatement(
  db: D1Database,
  hubId: string,
  orderId: string,
  mutationId: string,
  targetVersion: number,
  id: string,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO outbox (
        id, hub_id, order_id, destination, operation, target_version,
        mutation_id, status, attempts, next_attempt_at, created_at
      )
      SELECT ?, hub_id, id, 'calendar', 'UPSERT_EVENT', version, ?,
             'pending', 0, ?, ?
      FROM orders
      WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?`,
    )
    .bind(
      id,
      mutationId,
      now,
      now,
      orderId,
      hubId,
      targetVersion,
      mutationId,
    );
}

function notificationOutboxStatement(
  db: D1Database,
  hubId: string,
  orderId: string,
  mutationId: string,
  targetVersion: number,
  id: string,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT OR IGNORE INTO outbox (
        id, hub_id, order_id, destination, operation, target_version,
        mutation_id, status, attempts, next_attempt_at, created_at
      )
      SELECT ?, hub_id, id, 'notification', 'SEND_STATUS', version, ?,
             'pending', 0, ?, ?
      FROM orders
      WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?`,
    )
    .bind(
      id,
      mutationId,
      now,
      now,
      orderId,
      hubId,
      targetVersion,
      mutationId,
    );
}

async function classifyNoWrite(
  db: D1Database,
  actor: InternalContext,
  data: ApplyChangeInput,
  payloadHash: string,
  slot: CapacitySlot | null,
  current: OrderRow | null,
): Promise<ApplyChangeResult> {
  const racedEvent = await findEvent(db, actor.hubId, data.mutationId);
  if (racedEvent) {
    if (racedEvent.payload_hash !== payloadHash) {
      throw new ApplyChangeError("MUTATION_PAYLOAD_MISMATCH", 409);
    }
    return {
      order: await requireOrder(db, actor.hubId, data.orderId),
      replayed: true,
      customerCreated: replayCustomerCreated(racedEvent),
    };
  }

  if (data.intent === "createOrder") {
    if (current || (await findOrder(db, actor.hubId, data.orderId))) {
      throw new ApplyChangeError("ORDER_EXISTS", 409);
    }
    if (slot && (await isSlotFull(db, actor.hubId, slot.id, null))) {
      throw new ApplyChangeError("SLOT_FULL", 422);
    }
    throw new ApplyChangeError("INVALID_TRANSITION", 422);
  }

  const order = current ?? (await findOrder(db, actor.hubId, data.orderId));
  if (!order) {
    throw new ApplyChangeError("NOT_FOUND", 404);
  }

  if (order.version !== data.baseVersion) {
    throw new ApplyChangeError(
      "VERSION_CONFLICT",
      409,
      await requireOrder(db, actor.hubId, data.orderId),
    );
  }

  if (
    data.intent === "reschedule" &&
    slot &&
    (await isSlotFull(db, actor.hubId, slot.id, data.orderId))
  ) {
    throw new ApplyChangeError("SLOT_FULL", 422);
  }

  throw new ApplyChangeError("INVALID_TRANSITION", 422);
}

async function canonicalResult(
  db: D1Database,
  hubId: string,
  orderId: string,
  customerCreated: boolean,
): Promise<ApplyChangeResult> {
  return {
    order: await requireOrder(db, hubId, orderId),
    replayed: false,
    customerCreated,
  };
}

async function requireOrder(
  db: D1Database,
  hubId: string,
  orderId: string,
): Promise<OrderDetail> {
  const order = await getOrder(db, hubId, orderId);
  if (!order) {
    throw new ApplyChangeError("INTERNAL_ERROR", 500);
  }
  return order;
}

async function findOrder(
  db: D1Database,
  hubId: string,
  orderId: string,
): Promise<OrderRow | null> {
  return db
    .prepare(
      `SELECT id, hub_id, customer_id, status, service_type, delivery_slot_id,
              delivery_at, version, last_mutation_id, hold_comment, created_at,
              updated_at, cancelled_at
       FROM orders
       WHERE id = ? AND hub_id = ?`,
    )
    .bind(orderId, hubId)
    .first<OrderRow>();
}

async function findEvent(
  db: D1Database,
  hubId: string,
  mutationId: string,
): Promise<EventRow | null> {
  return db
    .prepare(
      `SELECT payload_hash, event_type, detail_json
       FROM order_events WHERE hub_id = ? AND mutation_id = ?`,
    )
    .bind(hubId, mutationId)
    .first<EventRow>();
}

function changesFor(results: D1Result[], index: number): number {
  return results[index]?.meta.changes ?? 0;
}

function replayCustomerCreated(event: EventRow): boolean {
  if (event.event_type !== "createOrder") {
    return false;
  }
  try {
    const detail: unknown = JSON.parse(event.detail_json);
    return (
      detail !== null &&
      typeof detail === "object" &&
      "customerCreated" in detail &&
      detail.customerCreated === true
    );
  } catch {
    return false;
  }
}

async function findCustomerByPhone(
  db: D1Database,
  hubId: string,
  phoneNormalized: string,
): Promise<CustomerRow | null> {
  return db
    .prepare(
      `SELECT id, hub_id, name, phone, phone_normalized
       FROM customers
       WHERE hub_id = ? AND phone_normalized = ?`,
    )
    .bind(hubId, phoneNormalized)
    .first<CustomerRow>();
}

async function resolveCreateCustomer(
  db: D1Database,
  hubId: string,
  payload: Extract<
    ApplyChangeInput,
    { intent: "createOrder" }
  >["payload"],
): Promise<ResolvedCustomer> {
  if ("customerId" in payload) {
    const customer = await db
      .prepare(
        `SELECT id, hub_id, name, phone, phone_normalized
         FROM customers
         WHERE id = ? AND hub_id = ?`,
      )
      .bind(payload.customerId, hubId)
      .first<CustomerRow>();
    if (!customer) {
      throw new ApplyChangeError("INVALID_CUSTOMER", 422);
    }
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      phoneNormalized: customer.phone_normalized,
    };
  }

  const phoneNormalized = normalizePhone(payload.customerPhone);
  if (!phoneNormalized) {
    throw new ApplyChangeError("INVALID_CUSTOMER", 422);
  }

  const existing = await findCustomerByPhone(db, hubId, phoneNormalized);
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      phone: existing.phone,
      phoneNormalized: existing.phone_normalized,
    };
  }

  return {
    id: await deriveCustomerId(hubId, phoneNormalized),
    name: payload.customerName,
    phone: phoneNormalized,
    phoneNormalized,
  };
}

function sourceForActor(actor: InternalContext): "app" | "calendar" | "system" {
  if (actor.actorType === "user") {
    return "app";
  }
  if (actor.actorId === "system:calendar") {
    return "calendar";
  }
  return "system";
}
