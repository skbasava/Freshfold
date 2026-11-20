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
import { tenants } from "./tenant.schema";

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id")
      .notNull()
      .default(1)
      .references(() => tenants.id, { onDelete: "restrict" }),
    branchId: integer("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    customerCode: text("customer_code").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    gstin: text("gstin"),
    /** Optional customer state code used as default place of supply */
    stateCode: text("state_code"),
    avatarR2Key: text("avatar_r2_key"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uq_customers_code").on(table.customerCode),
    index("idx_customers_phone").on(table.phone),
    index("idx_customers_branch_created").on(table.branchId, table.createdAt, table.id),
    index("idx_customers_tenant_hub").on(table.tenantId, table.branchId, table.isActive),
    check("chk_customers_is_active", sql`${table.isActive} IN (0, 1)`),
    check(
      "chk_customers_state_code",
      sql`${table.stateCode} IS NULL OR length(${table.stateCode}) = 2`,
    ),
  ],
);

export const customerAddresses = sqliteTable(
  "customer_addresses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    addressType: text("address_type").notNull().default("home"),
    label: text("label"),
    line1: text("line1").notNull(),
    line2: text("line2"),
    landmark: text("landmark"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    stateCode: text("state_code").notNull(),
    postalCode: text("postal_code").notNull(),
    isDefaultPickup: integer("is_default_pickup", { mode: "boolean" })
      .notNull()
      .default(false),
    isDefaultDelivery: integer("is_default_delivery", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("idx_customer_addresses_customer_id").on(table.customerId),
    check(
      "chk_customer_addresses_type",
      sql`${table.addressType} IN ('home', 'office', 'pickup', 'delivery', 'other')`,
    ),
    check("chk_customer_addresses_pickup_flag", sql`${table.isDefaultPickup} IN (0, 1)`),
    check("chk_customer_addresses_delivery_flag", sql`${table.isDefaultDelivery} IN (0, 1)`),
    check("chk_customer_addresses_state_code", sql`length(${table.stateCode}) = 2`),
  ],
);

export const customerPreferences = sqliteTable(
  "customer_preferences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    detergentPreference: text("detergent_preference"),
    starchLevel: text("starch_level"),
    foldOrHanger: text("fold_or_hanger"),
    fragranceFree: integer("fragrance_free", { mode: "boolean" })
      .notNull()
      .default(false),
    specialInstructions: text("special_instructions"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_customer_preferences_customer_id").on(table.customerId),
    check("chk_customer_preferences_fragrance", sql`${table.fragranceFree} IN (0, 1)`),
  ],
);
