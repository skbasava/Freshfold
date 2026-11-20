import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { tenants } from "./tenant.schema";

export const branches = sqliteTable(
  "branches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id")
      .notNull()
      .default(1)
      .references(() => tenants.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name").notNull(),
    gstin: text("gstin"),
    /** 2-digit Indian GST state code (e.g. '29' Karnataka, '27' Maharashtra) */
    stateCode: text("state_code").notNull(),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uq_branches_code").on(table.code),
    uniqueIndex("uq_branches_tenant_code").on(table.tenantId, table.code),
    index("idx_branches_tenant").on(table.tenantId, table.isActive),
    index("idx_branches_active").on(table.isActive),
    check("chk_branches_is_default", sql`${table.isDefault} IN (0, 1)`),
    check("chk_branches_is_active", sql`${table.isActive} IN (0, 1)`),
    check("chk_branches_state_code_len", sql`length(${table.stateCode}) = 2`),
  ],
);
