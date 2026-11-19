import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "./access.schema";

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    requestId: text("request_id"),
    summaryJson: text("summary_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_audit_logs_created_at").on(table.createdAt, table.id),
    index("idx_audit_logs_entity").on(table.entityType, table.entityId),
  ],
);

export const appSettings = sqliteTable(
  "app_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    settingKey: text("setting_key").notNull(),
    settingValueJson: text("setting_value_json").notNull(),
    description: text("description"),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_app_settings_key").on(table.settingKey)],
);

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBodyJson: text("response_body_json").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_idempotency_operation_key").on(
      table.operation,
      table.idempotencyKey,
    ),
    index("idx_idempotency_expires_at").on(table.expiresAt),
  ],
);
