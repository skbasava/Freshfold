import type {
  Customer,
  CustomerListResponse,
} from "../../../../packages/contracts/src/orders";
import type { Logger } from "../../../../packages/shared/src/observability";
import type { ICustomerRepository } from "../interfaces/customer.interface";
import { encodeCursor, type Cursor } from "../pagination";

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

export class CustomerRepository implements ICustomerRepository {
  constructor(
    private readonly db: D1Database,
    private readonly logger?: Logger,
  ) {}

  async list(
    hubId: string,
    options: { limit: number; cursor: Cursor | null },
  ): Promise<CustomerListResponse> {
    const start = Date.now();
    this.logger?.debug("customer_repo_list_started", {
      hubId,
      limit: options.limit,
      hasCursor: Boolean(options.cursor),
    });

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

    const result = await this.db
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

    this.logger?.debug("customer_repo_list_completed", {
      hubId,
      count: items.length,
      hasMore,
      durationMs: Date.now() - start,
    });

    return { items, nextCursor };
  }

  async getById(hubId: string, id: string): Promise<Customer | null> {
    const start = Date.now();
    this.logger?.debug("customer_repo_get_by_id_started", { hubId, customerId: id });

    const row = await this.db
      .prepare(
        `SELECT id, hub_id, name, phone, notes, created_at, updated_at
         FROM customers
         WHERE hub_id = ? AND id = ?`,
      )
      .bind(hubId, id)
      .first<CustomerRow>();

    this.logger?.debug("customer_repo_get_by_id_completed", {
      hubId,
      customerId: id,
      found: Boolean(row),
      durationMs: Date.now() - start,
    });

    return row ? mapCustomer(row) : null;
  }

  async findByPhone(hubId: string, phone: string): Promise<Customer | null> {
    const start = Date.now();
    this.logger?.debug("customer_repo_find_by_phone_started", { hubId });

    const row = await this.db
      .prepare(
        `SELECT id, hub_id, name, phone, notes, created_at, updated_at
         FROM customers
         WHERE hub_id = ? AND phone = ?`,
      )
      .bind(hubId, phone)
      .first<CustomerRow>();

    this.logger?.debug("customer_repo_find_by_phone_completed", {
      hubId,
      found: Boolean(row),
      durationMs: Date.now() - start,
    });

    return row ? mapCustomer(row) : null;
  }

  async create(customer: Customer): Promise<void> {
    const start = Date.now();
    this.logger?.debug("customer_repo_create_started", {
      hubId: customer.hubId,
      customerId: customer.id,
    });

    await this.db
      .prepare(
        `INSERT INTO customers (id, hub_id, name, phone, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        customer.id,
        customer.hubId,
        customer.name,
        customer.phone,
        customer.notes ?? null,
        customer.createdAt,
        customer.updatedAt,
      )
      .run();

    this.logger?.info("customer_repo_create_completed", {
      hubId: customer.hubId,
      customerId: customer.id,
      durationMs: Date.now() - start,
    });
  }
}

