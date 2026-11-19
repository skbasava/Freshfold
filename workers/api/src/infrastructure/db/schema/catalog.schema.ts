import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const itemCategories = sqliteTable(
  "item_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uq_item_categories_code").on(table.code),
    index("idx_item_categories_active_sort").on(table.isActive, table.sortOrder),
    check("chk_item_categories_is_active", sql`${table.isActive} IN (0, 1)`),
  ],
);

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => itemCategories.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    hsnSacCode: text("hsn_sac_code"),
    /** R2 object key for garment reference photo (never store BLOB/Base64 in D1) */
    imageR2Key: text("image_r2_key"),
    imageContentType: text("image_content_type"),
    imageSizeBytes: integer("image_size_bytes"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uq_items_code").on(table.code),
    index("idx_items_category_active").on(table.categoryId, table.isActive),
    check("chk_items_is_active", sql`${table.isActive} IN (0, 1)`),
    check(
      "chk_items_image_size",
      sql`${table.imageSizeBytes} IS NULL OR ${table.imageSizeBytes} >= 0`,
    ),
  ],
);

export const itemAttributes = sqliteTable(
  "item_attributes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    attributeKey: text("attribute_key").notNull(),
    attributeValue: text("attribute_value").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_item_attributes_item_key").on(table.itemId, table.attributeKey),
    index("idx_item_attributes_item_id").on(table.itemId),
  ],
);

export const serviceCategories = sqliteTable(
  "service_categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uq_service_categories_code").on(table.code),
    index("idx_service_categories_active_sort").on(table.isActive, table.sortOrder),
    check("chk_service_categories_is_active", sql`${table.isActive} IN (0, 1)`),
  ],
);

export const services = sqliteTable(
  "services",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => serviceCategories.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    defaultPricingBasis: text("default_pricing_basis").notNull(),
    /** Optional FK to tax_rates is linked in pricing module via taxRateId */
    defaultTaxRateId: integer("default_tax_rate_id"),
    turnaroundHours: integer("turnaround_hours").notNull().default(48),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uq_services_code").on(table.code),
    index("idx_services_category_active").on(table.categoryId, table.isActive),
    check(
      "chk_services_pricing_basis",
      sql`${table.defaultPricingBasis} IN ('per_item', 'per_kg')`,
    ),
    check("chk_services_turnaround_positive", sql`${table.turnaroundHours} > 0`),
    check("chk_services_is_active", sql`${table.isActive} IN (0, 1)`),
  ],
);
