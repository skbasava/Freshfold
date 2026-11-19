import { and, asc, desc, eq, lt, or, sql } from "drizzle-orm";
import type {
  CreateOrderAggregateInput,
  OrderAdjustmentRecord,
  OrderItemRecord,
  OrderNoteRecord,
  OrderRecord,
  OrderRepository,
  OrderStatusHistoryRecord,
  OrderWithDetails,
} from "../../domain/repositories/order.repository";
import type {
  OrderAdjustmentType,
  OrderStatus,
  PricingBasis,
  TaxSupplyType,
} from "../../shared/constants";
import { NotFoundError } from "../../shared/errors";
import {
  buildCursorPage,
  type CursorPage,
  type CursorPayload,
} from "../../shared/pagination";
import { mapSqliteError, type ApiDatabase } from "../db/client";
import {
  customers,
  orderAdjustments,
  orderItems,
  orderNotes,
  orders,
  orderStatusHistory,
} from "../db/schema";

function mapOrderRow(row: typeof orders.$inferSelect): OrderRecord {
  return {
    ...row,
    status: row.status as OrderStatus,
    taxSupplyType: row.taxSupplyType as TaxSupplyType,
  };
}

function mapOrderItemRow(row: typeof orderItems.$inferSelect): OrderItemRecord {
  return {
    ...row,
    pricingBasis: row.pricingBasis as PricingBasis,
  };
}

export class D1OrderRepository implements OrderRepository {
  constructor(
    private readonly db: ApiDatabase,
    private readonly d1: D1Database,
  ) {}

  /**
   * Atomically creates `orders`, all `order_items`, and initial `order_status_history`
   * in a single D1 `batch()` transaction keyed by unique `order_number`.
   */
  async createOrderAggregate(
    input: CreateOrderAggregateInput,
  ): Promise<OrderWithDetails> {
    try {
      const o = input.order;
      const statements: D1PreparedStatement[] = [
        this.d1
          .prepare(
            `INSERT INTO orders (
              branch_id, customer_id, rate_card_id, pickup_address_id, delivery_address_id,
              order_number, status, currency, supplier_state_code, place_of_supply_state_code,
              tax_supply_type, subtotal_paise, discount_paise, taxable_amount_paise,
              cgst_paise, sgst_paise, igst_paise, total_tax_paise, adjustments_paise,
              total_amount_paise, promised_delivery_at, special_instructions,
              created_by_user_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            o.branchId,
            o.customerId,
            o.rateCardId,
            o.pickupAddressId,
            o.deliveryAddressId,
            o.orderNumber,
            o.status,
            o.currency,
            o.supplierStateCode,
            o.placeOfSupplyStateCode,
            o.taxSupplyType,
            o.subtotalPaise,
            o.discountPaise,
            o.taxableAmountPaise,
            o.cgstPaise,
            o.sgstPaise,
            o.igstPaise,
            o.totalTaxPaise,
            o.adjustmentsPaise,
            o.totalAmountPaise,
            o.promisedDeliveryAt,
            o.specialInstructions,
            o.createdByUserId,
            o.createdAt,
            o.updatedAt,
          ),
      ];

      for (const item of input.items) {
        statements.push(
          this.d1
            .prepare(
              `INSERT INTO order_items (
                order_id, service_id, item_id, tax_rate_id,
                service_name_snapshot, item_name_snapshot, hsn_sac_code_snapshot,
                pricing_basis, quantity_pieces, weight_grams, unit_price_paise,
                gross_amount_paise, discount_paise, taxable_amount_paise,
                tax_rate_bps, cgst_rate_bps, sgst_rate_bps, igst_rate_bps,
                cgst_amount_paise, sgst_amount_paise, igst_amount_paise,
                total_tax_paise, line_total_paise, notes, created_at
              ) VALUES (
                (SELECT id FROM orders WHERE order_number = ?),
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              )`,
            )
            .bind(
              o.orderNumber,
              item.serviceId,
              item.itemId,
              item.taxRateId,
              item.serviceNameSnapshot,
              item.itemNameSnapshot,
              item.hsnSacCodeSnapshot,
              item.pricingBasis,
              item.quantityPieces,
              item.weightGrams,
              item.unitPricePaise,
              item.grossAmountPaise,
              item.discountPaise,
              item.taxableAmountPaise,
              item.taxRateBps,
              item.cgstRateBps,
              item.sgstRateBps,
              item.igstRateBps,
              item.cgstAmountPaise,
              item.sgstAmountPaise,
              item.igstAmountPaise,
              item.totalTaxPaise,
              item.lineTotalPaise,
              item.notes,
              item.createdAt,
            ),
        );
      }

      statements.push(
        this.d1
          .prepare(
            `INSERT INTO order_status_history (
              order_id, from_status, to_status, reason, changed_by_user_id, created_at
            ) VALUES (
              (SELECT id FROM orders WHERE order_number = ?),
              NULL, ?, ?, ?, ?
            )`,
          )
          .bind(
            o.orderNumber,
            o.status,
            input.initialStatusReason ?? null,
            input.changedByUserId ?? null,
            o.createdAt,
          ),
      );

      await this.d1.batch(statements);

      const [created] = await this.db
        .select()
        .from(orders)
        .where(eq(orders.orderNumber, o.orderNumber))
        .limit(1);

      if (!created) {
        throw new Error("Order not found immediately after atomic batch commit");
      }

      const details = await this.findWithDetails(created.id);
      if (!details) {
        throw new Error("Order details not found immediately after commit");
      }
      return details;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async findById(id: number): Promise<OrderRecord | null> {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    return row ? mapOrderRow(row) : null;
  }

  async findWithDetails(id: number): Promise<OrderWithDetails | null> {
    const order = await this.findById(id);
    if (!order) return null;

    const [itemRows, historyRows, noteRows, adjustmentRows] = await Promise.all([
      this.db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, id))
        .orderBy(asc(orderItems.id)),
      this.db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, id))
        .orderBy(asc(orderStatusHistory.createdAt), asc(orderStatusHistory.id)),
      this.db
        .select()
        .from(orderNotes)
        .where(eq(orderNotes.orderId, id))
        .orderBy(desc(orderNotes.createdAt), desc(orderNotes.id)),
      this.db
        .select()
        .from(orderAdjustments)
        .where(eq(orderAdjustments.orderId, id))
        .orderBy(asc(orderAdjustments.id)),
    ]);

    return {
      order,
      items: itemRows.map(mapOrderItemRow),
      statusHistory: historyRows.map(
        (h): OrderStatusHistoryRecord => ({
          ...h,
          fromStatus: (h.fromStatus as OrderStatus | null) ?? null,
          toStatus: h.toStatus as OrderStatus,
        }),
      ),
      notes: noteRows,
      adjustments: adjustmentRows.map(
        (a): OrderAdjustmentRecord => ({
          ...a,
          adjustmentType: a.adjustmentType as OrderAdjustmentType,
        }),
      ),
    };
  }

  async list(params: {
    branchId?: number;
    customerId?: number;
    status?: OrderStatus;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<OrderRecord>> {
    const conditions = [];
    if (params.branchId !== undefined) {
      conditions.push(eq(orders.branchId, params.branchId));
    }
    if (params.customerId !== undefined) {
      conditions.push(eq(orders.customerId, params.customerId));
    }
    if (params.status !== undefined) {
      conditions.push(eq(orders.status, params.status));
    }
    if (params.cursor) {
      conditions.push(
        or(
          lt(orders.createdAt, params.cursor.createdAt),
          and(
            eq(orders.createdAt, params.cursor.createdAt),
            lt(orders.id, params.cursor.id),
          ),
        ),
      );
    }

    const rows = await this.db
      .select({
        order: orders,
        customerName: customers.fullName,
        customerPhone: customers.phone,
        primaryService: sql<string | null>`(SELECT service_name_snapshot FROM order_items WHERE order_id = ${orders.id} ORDER BY id ASC LIMIT 1)`,
      })
      .from(orders)
      .leftJoin(customers, eq(customers.id, orders.customerId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(params.limit + 1);

    const mapped = rows.map((r) => ({
      ...mapOrderRow(r.order),
      customerName: r.customerName ?? undefined,
      customerPhone: r.customerPhone ?? undefined,
      primaryService: r.primaryService ?? undefined,
    }));

    return buildCursorPage(mapped, params.limit);
  }

  async transitionStatus(input: {
    orderId: number;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    reason?: string | null;
    changedByUserId?: number | null;
    nowIso: string;
  }): Promise<OrderRecord> {
    try {
      await this.d1.batch([
        this.d1
          .prepare(
            `UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?`,
          )
          .bind(input.toStatus, input.nowIso, input.orderId, input.fromStatus),
        this.d1
          .prepare(
            `INSERT INTO order_status_history (
              order_id, from_status, to_status, reason, changed_by_user_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            input.orderId,
            input.fromStatus,
            input.toStatus,
            input.reason ?? null,
            input.changedByUserId ?? null,
            input.nowIso,
          ),
      ]);

      const updated = await this.findById(input.orderId);
      if (!updated) {
        throw new NotFoundError(`Order #${input.orderId} not found`);
      }
      return updated;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async addNote(input: {
    orderId: number;
    note: string;
    isInternal: boolean;
    createdByUserId?: number | null;
    nowIso: string;
  }): Promise<OrderNoteRecord> {
    try {
      const [row] = await this.db
        .insert(orderNotes)
        .values({
          orderId: input.orderId,
          note: input.note,
          isInternal: input.isInternal,
          createdByUserId: input.createdByUserId ?? null,
          createdAt: input.nowIso,
        })
        .returning();
      return row!;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async addAdjustment(input: {
    orderId: number;
    adjustmentType: OrderAdjustmentType;
    description: string;
    amountPaise: number;
    createdByUserId?: number | null;
    nowIso: string;
  }): Promise<{ adjustment: OrderAdjustmentRecord; order: OrderRecord }> {
    try {
      const [insertedRows, updatedRows] = await this.db.batch([
        this.db
          .insert(orderAdjustments)
          .values({
            orderId: input.orderId,
            adjustmentType: input.adjustmentType,
            description: input.description,
            amountPaise: input.amountPaise,
            createdByUserId: input.createdByUserId ?? null,
            createdAt: input.nowIso,
          })
          .returning(),
        this.db
          .update(orders)
          .set({
            adjustmentsPaise: sql`${orders.adjustmentsPaise} + ${input.amountPaise}`,
            totalAmountPaise: sql`${orders.totalAmountPaise} + ${input.amountPaise}`,
            updatedAt: input.nowIso,
          })
          .where(eq(orders.id, input.orderId))
          .returning(),
      ]);

      const adj = insertedRows[0];
      const ord = updatedRows[0];
      if (!adj || !ord) {
        throw new NotFoundError(`Order #${input.orderId} not found`);
      }

      return {
        adjustment: {
          ...adj,
          adjustmentType: adj.adjustmentType as OrderAdjustmentType,
        },
        order: mapOrderRow(ord),
      };
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async updateOrderLines(input: {
    orderId: number;
    items: Array<Omit<OrderItemRecord, "id" | "orderId">>;
    totals: {
      subtotalPaise: number;
      discountPaise: number;
      taxableAmountPaise: number;
      cgstPaise: number;
      sgstPaise: number;
      igstPaise: number;
      totalTaxPaise: number;
      totalAmountPaise: number;
    };
    specialInstructions?: string | null;
    promisedDeliveryAt?: string | null;
    changedByUserId?: number | null;
    nowIso: string;
  }): Promise<OrderWithDetails> {
    try {
      const statements: D1PreparedStatement[] = [
        this.d1.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(input.orderId),
        this.d1
          .prepare(
            `UPDATE orders SET
              subtotal_paise = ?,
              discount_paise = ?,
              taxable_amount_paise = ?,
              cgst_paise = ?,
              sgst_paise = ?,
              igst_paise = ?,
              total_tax_paise = ?,
              total_amount_paise = ?,
              special_instructions = COALESCE(?, special_instructions),
              promised_delivery_at = COALESCE(?, promised_delivery_at),
              updated_at = ?
            WHERE id = ?`,
          )
          .bind(
            input.totals.subtotalPaise,
            input.totals.discountPaise,
            input.totals.taxableAmountPaise,
            input.totals.cgstPaise,
            input.totals.sgstPaise,
            input.totals.igstPaise,
            input.totals.totalTaxPaise,
            input.totals.totalAmountPaise,
            input.specialInstructions !== undefined ? input.specialInstructions : null,
            input.promisedDeliveryAt !== undefined ? input.promisedDeliveryAt : null,
            input.nowIso,
            input.orderId,
          ),
      ];

      for (const item of input.items) {
        statements.push(
          this.d1
            .prepare(
              `INSERT INTO order_items (
                order_id, service_id, item_id, tax_rate_id,
                service_name_snapshot, item_name_snapshot, hsn_sac_code_snapshot,
                pricing_basis, quantity_pieces, weight_grams, unit_price_paise,
                gross_amount_paise, discount_paise, taxable_amount_paise,
                tax_rate_bps, cgst_rate_bps, sgst_rate_bps, igst_rate_bps,
                cgst_amount_paise, sgst_amount_paise, igst_amount_paise,
                total_tax_paise, line_total_paise, notes, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              input.orderId,
              item.serviceId,
              item.itemId,
              item.taxRateId,
              item.serviceNameSnapshot,
              item.itemNameSnapshot,
              item.hsnSacCodeSnapshot,
              item.pricingBasis,
              item.quantityPieces,
              item.weightGrams,
              item.unitPricePaise,
              item.grossAmountPaise,
              item.discountPaise,
              item.taxableAmountPaise,
              item.taxRateBps,
              item.cgstRateBps,
              item.sgstRateBps,
              item.igstRateBps,
              item.cgstAmountPaise,
              item.sgstAmountPaise,
              item.igstAmountPaise,
              item.totalTaxPaise,
              item.lineTotalPaise,
              item.notes,
              input.nowIso,
            ),
        );
      }

      statements.push(
        this.d1
          .prepare(
            `INSERT INTO order_notes (order_id, note, is_internal, created_by_user_id, created_at)
             VALUES (?, ?, 1, ?, ?)`,
          )
          .bind(
            input.orderId,
            `Order garments updated by staff (${input.items.length} garments, total ₹${(input.totals.totalAmountPaise / 100).toFixed(2)})`,
            input.changedByUserId ?? null,
            input.nowIso,
          ),
      );

      await this.d1.batch(statements);

      const refreshed = await this.findWithDetails(input.orderId);
      if (!refreshed) {
        throw new NotFoundError(`Order #${input.orderId} not found`);
      }
      return refreshed;
    } catch (error) {
      mapSqliteError(error);
    }
  }
}
