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
import { branches } from "./branch.schema";
import { customers } from "./customer.schema";
import { orderItems, orders } from "./order.schema";

export const invoices = sqliteTable(
  "invoices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    branchId: integer("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    invoiceNumber: text("invoice_number").notNull(),
    status: text("status").notNull().default("draft"),
    currency: text("currency").notNull().default("INR"),
    /** Immutable GST legal document snapshots */
    supplierNameSnapshot: text("supplier_name_snapshot").notNull(),
    supplierGstinSnapshot: text("supplier_gstin_snapshot"),
    supplierStateCode: text("supplier_state_code").notNull(),
    customerNameSnapshot: text("customer_name_snapshot").notNull(),
    customerGstinSnapshot: text("customer_gstin_snapshot"),
    placeOfSupplyStateCode: text("place_of_supply_state_code").notNull(),
    taxSupplyType: text("tax_supply_type").notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    taxableAmountPaise: integer("taxable_amount_paise").notNull(),
    cgstPaise: integer("cgst_paise").notNull().default(0),
    sgstPaise: integer("sgst_paise").notNull().default(0),
    igstPaise: integer("igst_paise").notNull().default(0),
    totalTaxPaise: integer("total_tax_paise").notNull().default(0),
    totalAmountPaise: integer("total_amount_paise").notNull(),
    paidAmountPaise: integer("paid_amount_paise").notNull().default(0),
    balanceDuePaise: integer("balance_due_paise").notNull(),
    issuedAt: text("issued_at"),
    dueAt: text("due_at"),
    /** R2 object key for generated PDF invoice (never store PDF bytes in D1) */
    pdfR2Key: text("pdf_r2_key"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_invoices_invoice_number").on(table.invoiceNumber),
    index("idx_invoices_customer_created").on(table.customerId, table.createdAt, table.id),
    index("idx_invoices_order_id").on(table.orderId),
    check(
      "chk_invoices_status",
      sql`${table.status} IN ('draft', 'issued', 'partially_paid', 'paid', 'void')`,
    ),
    check(
      "chk_invoices_supply_type",
      sql`${table.taxSupplyType} IN ('intra_state', 'inter_state', 'exempt')`,
    ),
    check("chk_invoices_subtotal_non_neg", sql`${table.subtotalPaise} >= 0`),
    check("chk_invoices_discount_non_neg", sql`${table.discountPaise} >= 0`),
    check("chk_invoices_taxable_non_neg", sql`${table.taxableAmountPaise} >= 0`),
    check("chk_invoices_total_non_neg", sql`${table.totalAmountPaise} >= 0`),
    check("chk_invoices_paid_non_neg", sql`${table.paidAmountPaise} >= 0`),
    check("chk_invoices_balance_non_neg", sql`${table.balanceDuePaise} >= 0`),
    check("chk_invoices_supplier_state_len", sql`length(${table.supplierStateCode}) = 2`),
    check("chk_invoices_pos_state_len", sql`length(${table.placeOfSupplyStateCode}) = 2`),
  ],
);

export const invoiceItems = sqliteTable(
  "invoice_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    /** References order_items.id (NOT orders.id) per laundry.md §9 */
    orderItemId: integer("order_item_id").references(() => orderItems.id, {
      onDelete: "restrict",
    }),
    description: text("description").notNull(),
    hsnSacCode: text("hsn_sac_code").notNull(),
    pricingBasis: text("pricing_basis").notNull(),
    quantityPieces: integer("quantity_pieces"),
    weightGrams: integer("weight_grams"),
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
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_invoice_items_invoice_id").on(table.invoiceId),
    index("idx_invoice_items_order_item_id").on(table.orderItemId),
    check("chk_ii_pricing_basis", sql`${table.pricingBasis} IN ('per_item', 'per_kg')`),
    check("chk_ii_unit_price_non_neg", sql`${table.unitPricePaise} >= 0`),
    check("chk_ii_gross_non_neg", sql`${table.grossAmountPaise} >= 0`),
    check("chk_ii_discount_non_neg", sql`${table.discountPaise} >= 0`),
    check("chk_ii_taxable_non_neg", sql`${table.taxableAmountPaise} >= 0`),
    check("chk_ii_total_non_neg", sql`${table.lineTotalPaise} >= 0`),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    branchId: integer("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    /** Optional order link when payment is initiated against a specific order */
    orderId: integer("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    paymentNumber: text("payment_number").notNull(),
    paymentMethod: text("payment_method").notNull(),
    status: text("status").notNull().default("pending"),
    currency: text("currency").notNull().default("INR"),
    amountPaise: integer("amount_paise").notNull(),
    capturedAmountPaise: integer("captured_amount_paise").notNull().default(0),
    refundedAmountPaise: integer("refunded_amount_paise").notNull().default(0),
    provider: text("provider"),
    providerReference: text("provider_reference"),
    capturedAt: text("captured_at"),
    notes: text("notes"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_payments_payment_number").on(table.paymentNumber),
    index("idx_payments_customer_created").on(table.customerId, table.createdAt, table.id),
    index("idx_payments_order_id").on(table.orderId),
    check(
      "chk_payments_method",
      sql`${table.paymentMethod} IN ('cash', 'upi', 'card', 'bank_transfer', 'online_gateway')`,
    ),
    check(
      "chk_payments_status",
      sql`${table.status} IN ('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'cancelled')`,
    ),
    check("chk_payments_amount_pos", sql`${table.amountPaise} > 0`),
    check("chk_payments_captured_non_neg", sql`${table.capturedAmountPaise} >= 0`),
    check("chk_payments_refunded_non_neg", sql`${table.refundedAmountPaise} >= 0`),
    check(
      "chk_payments_refunded_le_captured",
      sql`${table.refundedAmountPaise} <= ${table.capturedAmountPaise}`,
    ),
  ],
);

export const paymentTransactions = sqliteTable(
  "payment_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paymentId: integer("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerReference: text("provider_reference").notNull(),
    /** Provider event ID for duplicate-webhook idempotency */
    providerEventId: text("provider_event_id"),
    transactionType: text("transaction_type").notNull(),
    status: text("status").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    /** Non-sensitive redacted metadata only — NEVER store raw card/CVV/bearer payloads */
    metadataJson: text("metadata_json"),
    processedAt: text("processed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_payment_transactions_payment_id").on(table.paymentId),
    index("idx_payment_transactions_provider_ref").on(
      table.provider,
      table.providerReference,
    ),
    uniqueIndex("uq_payment_transactions_provider_event")
      .on(table.provider, table.providerEventId)
      .where(sql`${table.providerEventId} IS NOT NULL`),
    check(
      "chk_pt_status",
      sql`${table.status} IN ('initiated', 'pending', 'succeeded', 'failed', 'reversed')`,
    ),
    check("chk_pt_amount_pos", sql`${table.amountPaise} > 0`),
  ],
);

export const refunds = sqliteTable(
  "refunds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paymentId: integer("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    invoiceId: integer("invoice_id").references(() => invoices.id, {
      onDelete: "restrict",
    }),
    refundNumber: text("refund_number").notNull(),
    status: text("status").notNull().default("pending"),
    amountPaise: integer("amount_paise").notNull(),
    reason: text("reason").notNull(),
    providerRefundReference: text("provider_refund_reference"),
    processedAt: text("processed_at"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_refunds_refund_number").on(table.refundNumber),
    index("idx_refunds_payment_id").on(table.paymentId),
    index("idx_refunds_invoice_id").on(table.invoiceId),
    check(
      "chk_refunds_status",
      sql`${table.status} IN ('pending', 'processed', 'failed', 'cancelled')`,
    ),
    check("chk_refunds_amount_pos", sql`${table.amountPaise} > 0`),
  ],
);

export const paymentAllocations = sqliteTable(
  "payment_allocations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paymentId: integer("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    amountPaise: integer("amount_paise").notNull(),
    allocatedByUserId: integer("allocated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_payment_allocations_invoice_id").on(table.invoiceId),
    index("idx_payment_allocations_payment_id").on(table.paymentId),
    check("chk_payment_allocations_amount_pos", sql`${table.amountPaise} > 0`),
  ],
);
