import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { branches } from "./branch.schema";
import { items, services } from "./catalog.schema";
import { customers } from "./customer.schema";
import { tenants } from "./tenant.schema";

export const taxRates = sqliteTable(
  "tax_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** HSN or SAC classification code (business/tax-advisor configured) */
    hsnSacCode: text("hsn_sac_code").notNull(),
    /** Rate in integer basis points (e.g. 500 = 5%, 1800 = 18%) */
    totalRateBps: integer("total_rate_bps").notNull(),
    cgstRateBps: integer("cgst_rate_bps").notNull(),
    sgstRateBps: integer("sgst_rate_bps").notNull(),
    igstRateBps: integer("igst_rate_bps").notNull(),
    isExempt: integer("is_exempt", { mode: "boolean" }).notNull().default(false),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_tax_rates_code_from").on(table.code, table.effectiveFrom),
    index("idx_tax_rates_active_effective").on(
      table.isActive,
      table.effectiveFrom,
      table.effectiveTo,
    ),
    check("chk_tax_rates_total_bps", sql`${table.totalRateBps} BETWEEN 0 AND 10000`),
    check("chk_tax_rates_cgst_bps", sql`${table.cgstRateBps} BETWEEN 0 AND 10000`),
    check("chk_tax_rates_sgst_bps", sql`${table.sgstRateBps} BETWEEN 0 AND 10000`),
    check("chk_tax_rates_igst_bps", sql`${table.igstRateBps} BETWEEN 0 AND 10000`),
    check(
      "chk_tax_rates_split_valid",
      sql`(${table.isExempt} = 1 AND ${table.totalRateBps} = 0 AND ${table.cgstRateBps} = 0 AND ${table.sgstRateBps} = 0 AND ${table.igstRateBps} = 0) OR (${table.isExempt} = 0 AND ${table.cgstRateBps} + ${table.sgstRateBps} = ${table.totalRateBps} AND ${table.igstRateBps} = ${table.totalRateBps})`,
    ),
    check(
      "chk_tax_rates_effective_range",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    check("chk_tax_rates_is_exempt", sql`${table.isExempt} IN (0, 1)`),
    check("chk_tax_rates_is_active", sql`${table.isActive} IN (0, 1)`),
  ],
);

export const rateCards = sqliteTable(
  "rate_cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id")
      .notNull()
      .default(1)
      .references(() => tenants.id, { onDelete: "restrict" }),
    branchId: integer("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uq_rate_cards_code").on(table.code),
    index("idx_rate_cards_tenant_hub").on(table.tenantId, table.branchId, table.isDefault, table.isActive),
    index("idx_rate_cards_branch_default").on(table.branchId, table.isDefault, table.isActive),
    check("chk_rate_cards_is_default", sql`${table.isDefault} IN (0, 1)`),
    check("chk_rate_cards_is_active", sql`${table.isActive} IN (0, 1)`),
    check(
      "chk_rate_cards_effective_range",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
  ],
);

export const rateCardItems = sqliteTable(
  "rate_card_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rateCardId: integer("rate_card_id")
      .notNull()
      .references(() => rateCards.id, { onDelete: "restrict" }),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    /** Nullable for weight-based (`per_kg`) general laundry rows */
    itemId: integer("item_id").references(() => items.id, { onDelete: "restrict" }),
    taxRateId: integer("tax_rate_id")
      .notNull()
      .references(() => taxRates.id, { onDelete: "restrict" }),
    pricingBasis: text("pricing_basis").notNull(),
    /**
     * Explicit non-null pricing key (`svc:<id>:item:<id|none>:<basis>`) so SQLite
     * unique indexes reliably prevent duplicate weight-based rows where item_id IS NULL.
     */
    pricingKey: text("pricing_key").notNull(),
    /**
     * Integer paise:
     * - per_item: paise per single piece
     * - per_kg: paise per kilogram (1000 grams)
     */
    unitPricePaise: integer("unit_price_paise").notNull(),
    /** Optional minimum billable quantity (pieces for per_item, grams for per_kg) */
    minQuantity: integer("min_quantity"),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_rate_card_items_key_from").on(
      table.rateCardId,
      table.pricingKey,
      table.effectiveFrom,
    ),
    uniqueIndex("uq_rate_card_items_open_active")
      .on(table.rateCardId, table.pricingKey)
      .where(sql`${table.isActive} = 1 AND ${table.effectiveTo} IS NULL`),
    index("idx_rate_card_items_lookup").on(
      table.rateCardId,
      table.pricingKey,
      table.isActive,
      table.effectiveFrom,
    ),
    index("idx_rate_card_items_service").on(table.serviceId),
    check("chk_rci_pricing_basis", sql`${table.pricingBasis} IN ('per_item', 'per_kg')`),
    check(
      "chk_rci_per_item_requires_item",
      sql`${table.pricingBasis} = 'per_kg' OR ${table.itemId} IS NOT NULL`,
    ),
    check("chk_rci_unit_price_non_neg", sql`${table.unitPricePaise} >= 0`),
    check(
      "chk_rci_min_quantity_pos",
      sql`${table.minQuantity} IS NULL OR ${table.minQuantity} > 0`,
    ),
    check(
      "chk_rci_effective_range",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    check("chk_rci_is_active", sql`${table.isActive} IN (0, 1)`),
  ],
);

export const customerRateCards = sqliteTable(
  "customer_rate_cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    rateCardId: integer("rate_card_id")
      .notNull()
      .references(() => rateCards.id, { onDelete: "restrict" }),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_customer_rate_cards_active_open")
      .on(table.customerId)
      .where(sql`${table.isActive} = 1 AND ${table.effectiveTo} IS NULL`),
    index("idx_customer_rate_cards_lookup").on(
      table.customerId,
      table.isActive,
      table.effectiveFrom,
    ),
    check("chk_crc_is_active", sql`${table.isActive} IN (0, 1)`),
    check(
      "chk_crc_effective_range",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
  ],
);
