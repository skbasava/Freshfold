import type {
  Customer,
  CustomerListResponse,
} from "../../../../packages/contracts/src/orders";
import {
  encodeCursor,
  type Cursor,
} from "../pagination";

type CustomerRow = {
  id: string;
  hub_id: string;
  name: string;
  phone: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
};

export function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    hubId: row.hub_id,
    name: row.name,
    phone: row.phone,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCustomers(
  db: D1Database,
  hubId: string,
  options: { limit: number; cursor: Cursor | null },
): Promise<CustomerListResponse> {
  const cursorClause = options.cursor
    ? "AND (created_at < ? OR (created_at = ? AND id < ?))"
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
      `SELECT id, hub_id, name, phone, notes, created_at, updated_at
       FROM customers
       WHERE hub_id = ?
       ${cursorClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(...bindings)
    .all<CustomerRow>();

  const hasMore = result.results.length > options.limit;
  const rows = result.results.slice(0, options.limit);
  const items = rows.map(mapCustomer);
  const last = items.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt, id: last.id })
      : null;

  return { items, nextCursor };
}

export async function getCustomer(
  db: D1Database,
  hubId: string,
  id: string,
): Promise<Customer | null> {
  const row = await db
    .prepare(
      `SELECT id, hub_id, name, phone, notes, created_at, updated_at
       FROM customers
       WHERE hub_id = ? AND id = ?`,
    )
    .bind(hubId, id)
    .first<CustomerRow>();

  return row ? mapCustomer(row) : null;
}
