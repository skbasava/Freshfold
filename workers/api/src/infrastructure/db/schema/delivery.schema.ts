import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { users } from "./access.schema";
import { customers, customerAddresses } from "./customer.schema";
import { orders } from "./order.schema";
export const deliveries = sqliteTable(
  "deliveries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    branchId: integer("branch_id").notNull().default(1),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    customerAddressId: integer("customer_address_id").references(
      () => customerAddresses.id,
      { onDelete: "set null" },
    ),
    deliveryType: text("delivery_type").notNull(),
    status: text("status").notNull().default("scheduled"),
    /** Immutable address snapshot captured at delivery/pickup creation */
    addressSnapshotJson: text("address_snapshot_json").notNull(),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    scheduledAt: text("scheduled_at").notNull(),
    windowStartAt: text("window_start_at"),
    windowEndAt: text("window_end_at"),
    completedAt: text("completed_at"),
    /** Optional R2 object key for proof-of-delivery photo/signature */
    proofR2Key: text("proof_r2_key"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_deliveries_status_scheduled").on(table.status, table.scheduledAt, table.id),
    index("idx_deliveries_order_id").on(table.orderId),
    index("idx_deliveries_customer_id").on(table.customerId),
    check("chk_deliveries_type", sql`${table.deliveryType} IN ('pickup', 'delivery')`),
    check(
      "chk_deliveries_status",
      sql`${table.status} IN ('scheduled', 'dispatched', 'in_transit', 'completed', 'failed', 'rescheduled', 'cancelled')`,
    ),
  ],
);

export const deliveryStatusHistory = sqliteTable(
  "delivery_status_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deliveryId: integer("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    reason: text("reason"),
    changedByUserId: integer("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_delivery_status_history_delivery_created").on(
      table.deliveryId,
      table.createdAt,
    ),
    check(
      "chk_dsh_to_status",
      sql`${table.toStatus} IN ('scheduled', 'dispatched', 'in_transit', 'completed', 'failed', 'rescheduled', 'cancelled')`,
    ),
  ],
);
