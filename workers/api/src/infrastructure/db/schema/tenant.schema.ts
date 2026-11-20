import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable(
  "tenants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    planTier: text("plan_tier").notNull().default("standard"),
    status: text("status").notNull().default("active"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uq_tenants_code").on(table.code),
    uniqueIndex("uq_tenants_slug").on(table.slug),
    index("idx_tenants_status").on(table.status),
    check(
      "chk_tenants_plan_tier",
      sql`${table.planTier} IN ('trial', 'standard', 'pro', 'enterprise')`,
    ),
    check(
      "chk_tenants_status",
      sql`${table.status} IN ('active', 'suspended', 'trial', 'deleted')`,
    ),
  ],
);
