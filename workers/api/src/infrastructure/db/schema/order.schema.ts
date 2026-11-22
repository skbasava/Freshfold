import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./access.schema";
import { items, services } from "./catalog.schema";
import { customerAddresses, customers } from "./customer.schema";
import { rateCards, taxRates } from "./pricing.schema";

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id").notNull().default(1),
    branchId: integer("branch_id").notNull().default(1),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    rateCardId: integer("rate_card_id")
      .notNull()
      .references(() => rateCards.id, { onDelete: "restrict" }),
    pickupAddressId: integer("pickup_address_id").references(
      () => customerAddresses.id,
      { onDelete: "set null" },
    ),
    deliveryAddressId: integer("delivery_address_id").references(
      () => customerAddresses.id,
      { onDelete: "set null" },
    ),
    orderNumber: text("order_number").notNull(),
    status: text("status").notNull().default("confirmed"),
    currency: text("currency").notNull().default("INR"),
    /** Immutable GST state snapshots captured at order creation */
    supplierStateCode: text("supplier_state_code").notNull(),
    placeOfSupplyStateCode: text("place_of_supply_state_code").notNull(),
    taxSupplyType: text("tax_supply_type").notNull(),
    /** Snapshot totals in integer paise */
    subtotalPaise: integer("subtotal_paise").notNull().default(0),
    discountPaise: integer("discount_paise").notNull().default(0),
    taxableAmountPaise: integer("taxable_amount_paise").notNull().default(0),
    cgstPaise: integer("cgst_paise").notNull().default(0),
    sgstPaise: integer("sgst_paise").notNull().default(0),
    igstPaise: integer("igst_paise").notNull().default(0),
    totalTaxPaise: integer("total_tax_paise").notNull().default(0),
    adjustmentsPaise: integer("adjustments_paise").notNull().default(0),
    totalAmountPaise: integer("total_amount_paise").notNull().default(0),
    promisedDeliveryAt: text("promised_delivery_at"),
    specialInstructions: text("special_instructions"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_orders_order_number").on(table.orderNumber),
    index("idx_orders_customer_created").on(table.customerId, table.createdAt, table.id),
    index("idx_orders_status_created").on(table.status, table.createdAt, table.id),
    index("idx_orders_branch_created").on(table.branchId, table.createdAt, table.id),
    index("idx_orders_tenant_hub").on(table.tenantId, table.branchId, table.status, table.createdAt),
    check(
      "chk_orders_status",
      sql`${table.status} IN ('draft', 'confirmed', 'pickup_scheduled', 'picked_up', 'received', 'processing', 'ready', 'out_for_delivery', 'delivered', 'hold', 'cancelled')`,
    ),
    check(
      "chk_orders_supply_type",
      sql`${table.taxSupplyType} IN ('intra_state', 'inter_state', 'exempt')`,
    ),
    check("chk_orders_subtotal_non_neg", sql`${table.subtotalPaise} >= 0`),
    check("chk_orders_discount_non_neg", sql`${table.discountPaise} >= 0`),
    check("chk_orders_taxable_non_neg", sql`${table.taxableAmountPaise} >= 0`),
    check("chk_orders_cgst_non_neg", sql`${table.cgstPaise} >= 0`),
    check("chk_orders_sgst_non_neg", sql`${table.sgstPaise} >= 0`),
    check("chk_orders_igst_non_neg", sql`${table.igstPaise} >= 0`),
    check("chk_orders_total_tax_non_neg", sql`${table.totalTaxPaise} >= 0`),
    check("chk_orders_total_non_neg", sql`${table.totalAmountPaise} >= 0`),
    check("chk_orders_supplier_state_len", sql`length(${table.supplierStateCode}) = 2`),
    check("chk_orders_pos_state_len", sql`length(${table.placeOfSupplyStateCode}) = 2`),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    /** Nullable for weight-based general laundry lines */
    itemId: integer("item_id").references(() => items.id, { onDelete: "restrict" }),
    taxRateId: integer("tax_rate_id")
      .notNull()
      .references(() => taxRates.id, { onDelete: "restrict" }),
    /** Immutable catalog & pricing snapshots captured at order creation */
    serviceNameSnapshot: text("service_name_snapshot").notNull(),
    itemNameSnapshot: text("item_name_snapshot"),
    hsnSacCodeSnapshot: text("hsn_sac_code_snapshot").notNull(),
    pricingBasis: text("pricing_basis").notNull(),
    /** Whole pieces when pricing_basis = 'per_item'; NULL for per_kg */
    quantityPieces: integer("quantity_pieces"),
    /** Integer grams when pricing_basis = 'per_kg'; NULL for per_item */
    weightGrams: integer("weight_grams"),
    /** Unit price in paise (per piece or per kg depending on pricing_basis) */
    unitPricePaise: integer("unit_price_paise").notNull(),
    grossAmountPaise: integer("gross_amount_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    taxableAmountPaise: integer("taxable_amount_paise").notNull(),
    taxRateBps: integer("tax_rate_bps").notNull(),
    cgstRateBps: integer("cgst_rate_bps").notNull(),
    sgstRateBps: integer("sgst_rate_bps").notNull(),
    igstRateBps: integer("igst_rate_bps").notNull(),
    cgstAmountPaise: integer("cgst_amount_paise").notNull(),
    sgstAmountPaise: integer("sgst_amount_paise").notNull(),
    igstAmountPaise: integer("igst_amount_paise").notNull(),
    totalTaxPaise: integer("total_tax_paise").notNull(),
    lineTotalPaise: integer("line_total_paise").notNull(),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_order_items_order_id").on(table.orderId),
    check("chk_oi_pricing_basis", sql`${table.pricingBasis} IN ('per_item', 'per_kg')`),
    check(
      "chk_oi_quantity_matches_basis",
      sql`(${table.pricingBasis} = 'per_item' AND ${table.quantityPieces} > 0 AND ${table.weightGrams} IS NULL) OR (${table.pricingBasis} = 'per_kg' AND ${table.weightGrams} > 0 AND ${table.quantityPieces} IS NULL)`,
    ),
    check("chk_oi_unit_price_non_neg", sql`${table.unitPricePaise} >= 0`),
    check("chk_oi_gross_non_neg", sql`${table.grossAmountPaise} >= 0`),
    check("chk_oi_discount_non_neg", sql`${table.discountPaise} >= 0`),
    check("chk_oi_taxable_non_neg", sql`${table.taxableAmountPaise} >= 0`),
    check("chk_oi_tax_bps", sql`${table.taxRateBps} BETWEEN 0 AND 10000`),
    check("chk_oi_total_non_neg", sql`${table.lineTotalPaise} >= 0`),
  ],
);

export const orderStatusHistory = sqliteTable(
  "order_status_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    reason: text("reason"),
    changedByUserId: integer("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_order_status_history_order_created").on(table.orderId, table.createdAt),
    check(
      "chk_osh_to_status",
      sql`${table.toStatus} IN ('draft', 'confirmed', 'pickup_scheduled', 'picked_up', 'received', 'processing', 'ready', 'out_for_delivery', 'delivered', 'hold', 'cancelled')`,
    ),
  ],
);

export const orderNotes = sqliteTable(
  "order_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    note: text("note").notNull(),
    isInternal: integer("is_internal", { mode: "boolean" }).notNull().default(true),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_order_notes_order_id").on(table.orderId),
    check("chk_order_notes_is_internal", sql`${table.isInternal} IN (0, 1)`),
  ],
);

export const orderAdjustments = sqliteTable(
  "order_adjustments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    adjustmentType: text("adjustment_type").notNull(),
    description: text("description").notNull(),
    /** Signed integer paise (negative for discounts, positive for surcharges/fees) */
    amountPaise: integer("amount_paise").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_order_adjustments_order_id").on(table.orderId),
    check(
      "chk_order_adjustments_type",
      sql`${table.adjustmentType} IN ('discount', 'surcharge', 'express_fee', 'delivery_fee', 'rounding')`,
    ),
  ],
);
