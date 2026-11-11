import {
  type Customer,
  type OrderDetail,
  type OrderItem,
  type OrderStatus,
  type OrderSummary,
  orderStatusSchema,
} from "../../../../packages/contracts/src/orders";
import { mapCustomer } from "../customers/read";
import { encodeCursor, type Cursor } from "../pagination";

type OrderRow = {
  id: string;
  hub_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  service_type: string;
  delivery_slot_id: string | null;
  delivery_at: number | null;
  version: number;
  created_at: number;
  updated_at: number;
  cancelled_at: number | null;
  hold_comment: string | null;
};

type OrderDetailRow = OrderRow & {
  customer_notes: string | null;
  customer_created_at: number;
  customer_updated_at: number;
};

type OrderItemRow = {
  id: string;
  hub_id: string;
  order_id: string;
  description: string;
  quantity: number;
  service_type: string | null;
  created_at: number;
};

export function mapOrderSummary(row: OrderRow): OrderSummary {
  return {
    id: row.id,
    hubId: row.hub_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    status: orderStatusSchema.parse(row.status) as OrderStatus,
    serviceType: row.service_type,
    deliverySlotId: row.delivery_slot_id,
    deliveryAt: row.delivery_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at,
    holdComment: row.hold_comment,
  };
}

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    hubId: row.hub_id,
    orderId: row.order_id,
    description: row.description,
    quantity: row.quantity,
    serviceType: row.service_type,
    createdAt: row.created_at,
  };
}

const ORDER_SUMMARY_COLUMNS = `
  o.id, o.hub_id, o.customer_id, c.name AS customer_name,
  c.phone AS customer_phone, o.status, o.service_type,
  o.delivery_slot_id, o.delivery_at, o.version, o.created_at,
  o.updated_at, o.cancelled_at, o.hold_comment
`;

export async function listOrders(
  db: D1Database,
  hubId: string,
  options: { limit: number; cursor: Cursor | null },
): Promise<{ items: OrderSummary[]; nextCursor: string | null }> {
  const cursorClause = options.cursor
    ? "AND (o.created_at < ? OR (o.created_at = ? AND o.id < ?))"
    : "";
  const bindings: Array<string | number> = [hubId];
  if (options.cursor) {
    bindings.push(
      options.cursor.createdAt,
      options.cursor.createdAt,
      options.cursor.id,
    );
  }
  bindings.push(options.limit + 1);

  const result = await db
    .prepare(
      `SELECT ${ORDER_SUMMARY_COLUMNS}
       FROM orders o
       JOIN customers c ON c.id = o.customer_id AND c.hub_id = o.hub_id
       WHERE o.hub_id = ?
       ${cursorClause}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ?`,
    )
    .bind(...bindings)
    .all<OrderRow>();

  const hasMore = result.results.length > options.limit;
  const rows = result.results.slice(0, options.limit);
  const items = rows.map(mapOrderSummary);
  const last = items.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt, id: last.id })
      : null;

  return { items, nextCursor };
}

export async function getOrder(
  db: D1Database,
  hubId: string,
  id: string,
): Promise<OrderDetail | null> {
  const row = await db
    .prepare(
      `SELECT ${ORDER_SUMMARY_COLUMNS},
              c.notes AS customer_notes,
              c.created_at AS customer_created_at,
              c.updated_at AS customer_updated_at
       FROM orders o
       JOIN customers c ON c.id = o.customer_id AND c.hub_id = o.hub_id
       WHERE o.hub_id = ? AND o.id = ?`,
    )
    .bind(hubId, id)
    .first<OrderDetailRow>();

  if (!row) {
    return null;
  }

  const items = await db
    .prepare(
      `SELECT id, hub_id, order_id, description, quantity, service_type, created_at
       FROM order_items
       WHERE hub_id = ? AND order_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(hubId, id)
    .all<OrderItemRow>();

  const customer: Customer = mapCustomer({
    id: row.customer_id,
    hub_id: row.hub_id,
    name: row.customer_name,
    phone: row.customer_phone,
    notes: row.customer_notes,
    created_at: row.customer_created_at,
    updated_at: row.customer_updated_at,
  });

  return {
    ...mapOrderSummary(row),
    customer,
    items: items.results.map(mapOrderItem),
  };
}
