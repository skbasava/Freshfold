import type {
  Customer,
  OrderDetail,
  OrderItem,
  OrderStatus,
  OrderSummary,
} from "../../../../packages/contracts/src/orders";
import { orderStatusSchema } from "../../../../packages/contracts/src/orders";
import type { OrderEvent } from "../../../../packages/contracts/src/changes";
import type { Logger } from "../../../../packages/shared/src/observability";
import type { IOrderRepository } from "../interfaces/order.interface";
import { encodeCursor, type Cursor } from "../pagination";
import { mapCustomer } from "./customer.repository";

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
  tenant_id?: string | null;
  crn_id?: string | null;
  crn_packed?: number | null;
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

type OrderEventRow = {
  id: string;
  hub_id: string;
  order_id: string;
  mutation_id: string;
  event_type: string;
  source: "app" | "calendar" | "system";
  actor_type: "user" | "service" | "system";
  actor_id: string | null;
  previous_version: number;
  new_version: number;
  at: number;
  detail_json: string;
};

export function mapOrderSummary(row: OrderRow): OrderSummary {
  return {
    id: row.id,
    hubId: row.hub_id,
    tenantId: row.tenant_id ?? undefined,
    crnId: row.crn_id ?? null,
    crnPacked: row.crn_packed ?? null,
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
  o.updated_at, o.cancelled_at, o.hold_comment, o.tenant_id,
  o.crn_id, o.crn_packed
`;

export class OrderRepository implements IOrderRepository {
  constructor(
    private readonly db: D1Database,
    private readonly logger?: Logger,
  ) {}

  async getById(hubId: string, id: string, tenantId?: string): Promise<OrderDetail | null> {
    const start = Date.now();
    this.logger?.debug("order_repo_get_by_id_started", { hubId, orderId: id, tenantId });

    const tenantClause = tenantId ? "AND (o.tenant_id = ? OR o.tenant_id IS NULL)" : "";
    const bindings = tenantId ? [hubId, id, id, tenantId] : [hubId, id, id];

    const row = await this.db
      .prepare(
        `SELECT ${ORDER_SUMMARY_COLUMNS},
                c.notes AS customer_notes,
                c.created_at AS customer_created_at,
                c.updated_at AS customer_updated_at
         FROM orders o
         JOIN customers c ON c.id = o.customer_id AND c.hub_id = o.hub_id
         WHERE o.hub_id = ? AND (o.id = ? OR o.crn_id = ?) ${tenantClause}`,
      )
      .bind(...bindings)
      .first<OrderDetailRow>();

    if (!row) {
      this.logger?.debug("order_repo_get_by_id_not_found", {
        hubId,
        orderId: id,
        durationMs: Date.now() - start,
      });
      return null;
    }

    const items = await this.db
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

    this.logger?.debug("order_repo_get_by_id_completed", {
      hubId,
      orderId: id,
      itemCount: items.results.length,
      durationMs: Date.now() - start,
    });

    return {
      ...mapOrderSummary(row),
      customer,
      items: items.results.map(mapOrderItem),
    };
  }

  async list(
    hubId: string,
    options: { limit: number; cursor: Cursor | null },
    tenantId?: string,
  ): Promise<{ items: OrderSummary[]; nextCursor: string | null }> {
    const start = Date.now();
    this.logger?.debug("order_repo_list_started", {
      hubId,
      limit: options.limit,
      hasCursor: Boolean(options.cursor),
      tenantId,
    });

    const cursorClause = options.cursor
      ? "AND (o.created_at < ? OR (o.created_at = ? AND o.id < ?))"
      : "";
    const tenantClause = tenantId ? "AND (o.tenant_id = ? OR o.tenant_id IS NULL)" : "";
    const bindings: Array<string | number> = [hubId];
    if (tenantId) {
      bindings.push(tenantId);
    }
    if (options.cursor) {
      bindings.push(
        options.cursor.createdAt,
        options.cursor.createdAt,
        options.cursor.id,
      );
    }
    bindings.push(options.limit + 1);

    const result = await this.db
      .prepare(
        `SELECT ${ORDER_SUMMARY_COLUMNS}
         FROM orders o
         JOIN customers c ON c.id = o.customer_id AND c.hub_id = o.hub_id
         WHERE o.hub_id = ?
         ${tenantClause}
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

    this.logger?.debug("order_repo_list_completed", {
      hubId,
      count: items.length,
      hasMore,
      durationMs: Date.now() - start,
    });

    return { items, nextCursor };
  }

  async listEvents(
    hubId: string,
    orderId: string,
    limit: number,
    tenantId?: string,
  ): Promise<OrderEvent[]> {
    const start = Date.now();
    this.logger?.debug("order_repo_list_events_started", {
      hubId,
      orderId,
      limit,
      tenantId,
    });

    const tenantClause = tenantId ? "AND (tenant_id = ? OR tenant_id IS NULL)" : "";
    const bindings = tenantId ? [hubId, orderId, tenantId, limit] : [hubId, orderId, limit];

    const result = await this.db
      .prepare(
        `SELECT
          id, hub_id, order_id, mutation_id, event_type, source, actor_type,
          actor_id, previous_version, new_version, at, detail_json
         FROM order_events
         WHERE hub_id = ? AND order_id = ? ${tenantClause}
         ORDER BY at DESC, id DESC
         LIMIT ?`,
      )
      .bind(...bindings)
      .all<OrderEventRow>();

    this.logger?.debug("order_repo_list_events_completed", {
      hubId,
      orderId,
      count: result.results.length,
      durationMs: Date.now() - start,
    });

    return result.results.map((row) => ({
      id: row.id,
      hubId: row.hub_id,
      orderId: row.order_id,
      mutationId: row.mutation_id,
      eventType: row.event_type,
      source: row.source,
      actorType: row.actor_type,
      actorId: row.actor_id,
      previousVersion: row.previous_version,
      newVersion: row.new_version,
      at: row.at,
      detail: JSON.parse(row.detail_json) as unknown,
    }));
  }
}

export async function getOrder(
  db: D1Database,
  hubId: string,
  id: string,
): Promise<OrderDetail | null> {
  return new OrderRepository(db).getById(hubId, id);
}

export async function listOrders(
  db: D1Database,
  hubId: string,
  options: { limit: number; cursor: Cursor | null },
): Promise<{ items: OrderSummary[]; nextCursor: string | null }> {
  return new OrderRepository(db).list(hubId, options);
}

export async function listOrderEvents(
  db: D1Database,
  hubId: string,
  orderId: string,
  limit: number,
): Promise<OrderEvent[]> {
  return new OrderRepository(db).listEvents(hubId, orderId, limit);
}


