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

/**
 * Staff identity and RBAC tables linked to Supabase Auth (`supabase_user_id`).
 *
 * Security invariant (ADR-015): Supabase Auth is the sole identity & session
 * provider. No password hashes or local session tokens are stored in D1.
 * The `sessions` table from laundry.md is intentionally omitted and documented.
 */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    branchId: integer("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    /** Verified Supabase Auth `sub` UUID */
    supabaseUserId: text("supabase_user_id").notNull(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uq_users_supabase_user_id").on(table.supabaseUserId),
    uniqueIndex("uq_users_email").on(table.email),
    index("idx_users_branch_active").on(table.branchId, table.isActive),
    check("chk_users_is_active", sql`${table.isActive} IN (0, 1)`),
  ],
);

export const roles = sqliteTable(
  "roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_roles_code").on(table.code),
    check("chk_roles_is_active", sql`${table.isActive} IN (0, 1)`),
  ],
);

export const userRoles = sqliteTable(
  "user_roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedByUserId: integer("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_user_roles_user_role").on(table.userId, table.roleId),
    index("idx_user_roles_role_id").on(table.roleId),
  ],
);
