-- Migration 0004: Retire D1 Tenant and Hub/Branch tables and foreign keys
-- Tenants and Hubs are managed in Supabase Auth and passed via verified JWT tokens.
-- D1 keeps tenant_id and branch_id as partition keys on child tables without FK constraints.

PRAGMA foreign_keys=OFF;

-- 1. Customers: rebuild table without foreign key to branches or tenants
CREATE TABLE `__new_customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`customer_code` text NOT NULL,
	`full_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`gstin` text,
	`state_code` text,
	`avatar_r2_key` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "chk_customers_is_active" CHECK("__new_customers"."is_active" IN (0, 1)),
	CONSTRAINT "chk_customers_state_code" CHECK("__new_customers"."state_code" IS NULL OR length("__new_customers"."state_code") = 2)
);
INSERT INTO `__new_customers`("id", "tenant_id", "branch_id", "customer_code", "full_name", "phone", "email", "gstin", "state_code", "avatar_r2_key", "is_active", "created_at", "updated_at", "deleted_at")
SELECT "id", "tenant_id", "branch_id", "customer_code", "full_name", "phone", "email", "gstin", "state_code", "avatar_r2_key", "is_active", "created_at", "updated_at", "deleted_at" FROM `customers`;
DROP TABLE `customers`;
ALTER TABLE `__new_customers` RENAME TO `customers`;
CREATE UNIQUE INDEX `uq_customers_code` ON `customers` (`customer_code`);
CREATE INDEX `idx_customers_phone` ON `customers` (`phone`);
CREATE INDEX `idx_customers_branch_created` ON `customers` (`branch_id`,`created_at`,`id`);
CREATE INDEX `idx_customers_tenant_hub` ON `customers` (`tenant_id`,`branch_id`,`is_active`);

-- 2. Deliveries: rebuild table without foreign key to branches
CREATE TABLE `__new_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`order_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`customer_address_id` integer,
	`delivery_type` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`address_snapshot_json` text NOT NULL,
	`contact_name` text NOT NULL,
	`contact_phone` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`window_start_at` text,
	`window_end_at` text,
	`completed_at` text,
	`proof_r2_key` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_address_id`) REFERENCES `customer_addresses`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_deliveries_type" CHECK("__new_deliveries"."delivery_type" IN ('pickup', 'delivery')),
	CONSTRAINT "chk_deliveries_status" CHECK("__new_deliveries"."status" IN ('scheduled', 'dispatched', 'in_transit', 'completed', 'failed', 'rescheduled', 'cancelled'))
);
INSERT INTO `__new_deliveries`("id", "branch_id", "order_id", "customer_id", "customer_address_id", "delivery_type", "status", "address_snapshot_json", "contact_name", "contact_phone", "scheduled_at", "window_start_at", "window_end_at", "completed_at", "proof_r2_key", "notes", "created_at", "updated_at")
SELECT "id", "branch_id", "order_id", "customer_id", "customer_address_id", "delivery_type", "status", "address_snapshot_json", "contact_name", "contact_phone", "scheduled_at", "window_start_at", "window_end_at", "completed_at", "proof_r2_key", "notes", "created_at", "updated_at" FROM `deliveries`;
DROP TABLE `deliveries`;
ALTER TABLE `__new_deliveries` RENAME TO `deliveries`;
CREATE INDEX `idx_deliveries_status_scheduled` ON `deliveries` (`status`,`scheduled_at`,`id`);
CREATE INDEX `idx_deliveries_order_id` ON `deliveries` (`order_id`);
CREATE INDEX `idx_deliveries_customer_id` ON `deliveries` (`customer_id`);

-- 3. Invoices: rebuild table without foreign key to branches
CREATE TABLE `__new_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`order_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`invoice_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`supplier_name_snapshot` text NOT NULL,
	`supplier_gstin_snapshot` text,
	`supplier_state_code` text NOT NULL,
	`customer_name_snapshot` text NOT NULL,
	`customer_gstin_snapshot` text,
	`place_of_supply_state_code` text NOT NULL,
	`tax_supply_type` text NOT NULL,
	`subtotal_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`taxable_amount_paise` integer NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`total_tax_paise` integer DEFAULT 0 NOT NULL,
	`total_amount_paise` integer NOT NULL,
	`paid_amount_paise` integer DEFAULT 0 NOT NULL,
	`balance_due_paise` integer NOT NULL,
	`issued_at` text,
	`due_at` text,
	`pdf_r2_key` text,
	`created_by_user_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_invoices_status" CHECK("__new_invoices"."status" IN ('draft', 'issued', 'partially_paid', 'paid', 'void')),
	CONSTRAINT "chk_invoices_supply_type" CHECK("__new_invoices"."tax_supply_type" IN ('intra_state', 'inter_state', 'exempt')),
	CONSTRAINT "chk_invoices_subtotal_non_neg" CHECK("__new_invoices"."subtotal_paise" >= 0),
	CONSTRAINT "chk_invoices_discount_non_neg" CHECK("__new_invoices"."discount_paise" >= 0),
	CONSTRAINT "chk_invoices_taxable_non_neg" CHECK("__new_invoices"."taxable_amount_paise" >= 0),
	CONSTRAINT "chk_invoices_total_non_neg" CHECK("__new_invoices"."total_amount_paise" >= 0),
	CONSTRAINT "chk_invoices_paid_non_neg" CHECK("__new_invoices"."paid_amount_paise" >= 0),
	CONSTRAINT "chk_invoices_balance_non_neg" CHECK("__new_invoices"."balance_due_paise" >= 0),
	CONSTRAINT "chk_invoices_supplier_state_len" CHECK(length("__new_invoices"."supplier_state_code") = 2),
	CONSTRAINT "chk_invoices_pos_state_len" CHECK(length("__new_invoices"."place_of_supply_state_code") = 2)
);
INSERT INTO `__new_invoices`("id", "branch_id", "order_id", "customer_id", "invoice_number", "status", "currency", "supplier_name_snapshot", "supplier_gstin_snapshot", "supplier_state_code", "customer_name_snapshot", "customer_gstin_snapshot", "place_of_supply_state_code", "tax_supply_type", "subtotal_paise", "discount_paise", "taxable_amount_paise", "cgst_paise", "sgst_paise", "igst_paise", "total_tax_paise", "total_amount_paise", "paid_amount_paise", "balance_due_paise", "issued_at", "due_at", "pdf_r2_key", "created_by_user_id", "created_at", "updated_at")
SELECT "id", "branch_id", "order_id", "customer_id", "invoice_number", "status", "currency", "supplier_name_snapshot", "supplier_gstin_snapshot", "supplier_state_code", "customer_name_snapshot", "customer_gstin_snapshot", "place_of_supply_state_code", "tax_supply_type", "subtotal_paise", "discount_paise", "taxable_amount_paise", "cgst_paise", "sgst_paise", "igst_paise", "total_tax_paise", "total_amount_paise", "paid_amount_paise", "balance_due_paise", "issued_at", "due_at", "pdf_r2_key", "created_by_user_id", "created_at", "updated_at" FROM `invoices`;
DROP TABLE `invoices`;
ALTER TABLE `__new_invoices` RENAME TO `invoices`;
CREATE UNIQUE INDEX `uq_invoices_invoice_number` ON `invoices` (`invoice_number`);
CREATE INDEX `idx_invoices_customer_created` ON `invoices` (`customer_id`,`created_at`,`id`);
CREATE INDEX `idx_invoices_order_id` ON `invoices` (`order_id`);

-- 4. Orders: rebuild table without foreign key to branches or tenants
CREATE TABLE `__new_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`customer_id` integer NOT NULL,
	`rate_card_id` integer NOT NULL,
	`pickup_address_id` integer,
	`delivery_address_id` integer,
	`order_number` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`supplier_state_code` text NOT NULL,
	`place_of_supply_state_code` text NOT NULL,
	`tax_supply_type` text NOT NULL,
	`subtotal_paise` integer DEFAULT 0 NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`taxable_amount_paise` integer DEFAULT 0 NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`total_tax_paise` integer DEFAULT 0 NOT NULL,
	`adjustments_paise` integer DEFAULT 0 NOT NULL,
	`total_amount_paise` integer DEFAULT 0 NOT NULL,
	`promised_delivery_at` text,
	`special_instructions` text,
	`created_by_user_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rate_card_id`) REFERENCES `rate_cards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pickup_address_id`) REFERENCES `customer_addresses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`delivery_address_id`) REFERENCES `customer_addresses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_orders_status" CHECK("__new_orders"."status" IN ('draft', 'confirmed', 'pickup_scheduled', 'picked_up', 'received', 'processing', 'ready', 'out_for_delivery', 'delivered', 'hold', 'cancelled')),
	CONSTRAINT "chk_orders_supply_type" CHECK("__new_orders"."tax_supply_type" IN ('intra_state', 'inter_state', 'exempt')),
	CONSTRAINT "chk_orders_subtotal_non_neg" CHECK("__new_orders"."subtotal_paise" >= 0),
	CONSTRAINT "chk_orders_discount_non_neg" CHECK("__new_orders"."discount_paise" >= 0),
	CONSTRAINT "chk_orders_taxable_non_neg" CHECK("__new_orders"."taxable_amount_paise" >= 0),
	CONSTRAINT "chk_orders_cgst_non_neg" CHECK("__new_orders"."cgst_paise" >= 0),
	CONSTRAINT "chk_orders_sgst_non_neg" CHECK("__new_orders"."sgst_paise" >= 0),
	CONSTRAINT "chk_orders_igst_non_neg" CHECK("__new_orders"."igst_paise" >= 0),
	CONSTRAINT "chk_orders_total_tax_non_neg" CHECK("__new_orders"."total_tax_paise" >= 0),
	CONSTRAINT "chk_orders_total_non_neg" CHECK("__new_orders"."total_amount_paise" >= 0),
	CONSTRAINT "chk_orders_supplier_state_len" CHECK(length("__new_orders"."supplier_state_code") = 2),
	CONSTRAINT "chk_orders_pos_state_len" CHECK(length("__new_orders"."place_of_supply_state_code") = 2)
);
INSERT INTO `__new_orders`("id", "tenant_id", "branch_id", "customer_id", "rate_card_id", "pickup_address_id", "delivery_address_id", "order_number", "status", "currency", "supplier_state_code", "place_of_supply_state_code", "tax_supply_type", "subtotal_paise", "discount_paise", "taxable_amount_paise", "cgst_paise", "sgst_paise", "igst_paise", "total_tax_paise", "adjustments_paise", "total_amount_paise", "promised_delivery_at", "special_instructions", "created_by_user_id", "created_at", "updated_at")
SELECT "id", "tenant_id", "branch_id", "customer_id", "rate_card_id", "pickup_address_id", "delivery_address_id", "order_number", "status", "currency", "supplier_state_code", "place_of_supply_state_code", "tax_supply_type", "subtotal_paise", "discount_paise", "taxable_amount_paise", "cgst_paise", "sgst_paise", "igst_paise", "total_tax_paise", "adjustments_paise", "total_amount_paise", "promised_delivery_at", "special_instructions", "created_by_user_id", "created_at", "updated_at" FROM `orders`;
DROP TABLE `orders`;
ALTER TABLE `__new_orders` RENAME TO `orders`;
CREATE UNIQUE INDEX `uq_orders_order_number` ON `orders` (`order_number`);
CREATE INDEX `idx_orders_customer_created` ON `orders` (`customer_id`,`created_at`,`id`);
CREATE INDEX `idx_orders_status_created` ON `orders` (`status`,`created_at`,`id`);
CREATE INDEX `idx_orders_branch_created` ON `orders` (`branch_id`,`created_at`,`id`);
CREATE INDEX `idx_orders_tenant_hub` ON `orders` (`tenant_id`,`branch_id`,`status`,`created_at`);

-- 5. Payments: rebuild table without foreign key to branches
CREATE TABLE `__new_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`customer_id` integer NOT NULL,
	`order_id` integer,
	`payment_number` text NOT NULL,
	`payment_method` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`amount_paise` integer NOT NULL,
	`captured_amount_paise` integer DEFAULT 0 NOT NULL,
	`refunded_amount_paise` integer DEFAULT 0 NOT NULL,
	`provider` text,
	`provider_reference` text,
	`captured_at` text,
	`notes` text,
	`created_by_user_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_payments_method" CHECK("__new_payments"."payment_method" IN ('cash', 'upi', 'card', 'bank_transfer', 'online_gateway')),
	CONSTRAINT "chk_payments_status" CHECK("__new_payments"."status" IN ('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'cancelled')),
	CONSTRAINT "chk_payments_amount_pos" CHECK("__new_payments"."amount_paise" > 0),
	CONSTRAINT "chk_payments_captured_non_neg" CHECK("__new_payments"."captured_amount_paise" >= 0),
	CONSTRAINT "chk_payments_refunded_non_neg" CHECK("__new_payments"."refunded_amount_paise" >= 0),
	CONSTRAINT "chk_payments_refunded_le_captured" CHECK("__new_payments"."refunded_amount_paise" <= "__new_payments"."captured_amount_paise")
);
INSERT INTO `__new_payments`("id", "branch_id", "customer_id", "order_id", "payment_number", "payment_method", "status", "currency", "amount_paise", "captured_amount_paise", "refunded_amount_paise", "provider", "provider_reference", "captured_at", "notes", "created_by_user_id", "created_at", "updated_at")
SELECT "id", "branch_id", "customer_id", "order_id", "payment_number", "payment_method", "status", "currency", "amount_paise", "captured_amount_paise", "refunded_amount_paise", "provider", "provider_reference", "captured_at", "notes", "created_by_user_id", "created_at", "updated_at" FROM `payments`;
DROP TABLE `payments`;
ALTER TABLE `__new_payments` RENAME TO `payments`;
CREATE UNIQUE INDEX `uq_payments_payment_number` ON `payments` (`payment_number`);
CREATE INDEX `idx_payments_customer_created` ON `payments` (`customer_id`,`created_at`,`id`);
CREATE INDEX `idx_payments_order_id` ON `payments` (`order_id`);

-- 6. Rate Cards: rebuild table without foreign key to branches or tenants
CREATE TABLE `__new_rate_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "chk_rate_cards_is_default" CHECK("__new_rate_cards"."is_default" IN (0, 1)),
	CONSTRAINT "chk_rate_cards_is_active" CHECK("__new_rate_cards"."is_active" IN (0, 1)),
	CONSTRAINT "chk_rate_cards_effective_range" CHECK("__new_rate_cards"."effective_to" IS NULL OR "__new_rate_cards"."effective_to" >= "__new_rate_cards"."effective_from")
);
INSERT INTO `__new_rate_cards`("id", "tenant_id", "branch_id", "code", "name", "description", "is_default", "is_active", "effective_from", "effective_to", "created_at", "updated_at", "deleted_at")
SELECT "id", "tenant_id", "branch_id", "code", "name", "description", "is_default", "is_active", "effective_from", "effective_to", "created_at", "updated_at", "deleted_at" FROM `rate_cards`;
DROP TABLE `rate_cards`;
ALTER TABLE `__new_rate_cards` RENAME TO `rate_cards`;
CREATE UNIQUE INDEX `uq_rate_cards_code` ON `rate_cards` (`code`);
CREATE INDEX `idx_rate_cards_tenant_hub` ON `rate_cards` (`tenant_id`,`branch_id`,`is_default`,`is_active`);
CREATE INDEX `idx_rate_cards_branch_default` ON `rate_cards` (`branch_id`,`is_default`,`is_active`);

-- 7. Users: rebuild table without foreign key to branches or tenants
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer DEFAULT 1 NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`supabase_user_id` text NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "chk_users_is_active" CHECK("__new_users"."is_active" IN (0, 1))
);
INSERT INTO `__new_users`("id", "tenant_id", "branch_id", "supabase_user_id", "email", "full_name", "phone", "is_active", "created_at", "updated_at", "deleted_at")
SELECT "id", "tenant_id", "branch_id", "supabase_user_id", "email", "full_name", "phone", "is_active", "created_at", "updated_at", "deleted_at" FROM `users`;
DROP TABLE `users`;
ALTER TABLE `__new_users` RENAME TO `users`;
CREATE UNIQUE INDEX `uq_users_supabase_user_id` ON `users` (`supabase_user_id`);
CREATE UNIQUE INDEX `uq_users_email` ON `users` (`email`);
CREATE INDEX `idx_users_tenant_hub` ON `users` (`tenant_id`,`branch_id`,`is_active`);
CREATE INDEX `idx_users_branch_active` ON `users` (`branch_id`,`is_active`);

-- 8. Tenant Notification Configs: rebuild table without foreign key to tenants
CREATE TABLE `__new_tenant_notification_configs` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `tenant_id` INTEGER NOT NULL UNIQUE,
  `tenant_code` TEXT,
  `email_provider` TEXT CHECK(`email_provider` IN ('brevo', 'resend')),
  `email_config_json` TEXT,
  `whatsapp_provider` TEXT CHECK(`whatsapp_provider` IN ('openwa', 'whatsapp_cloud')),
  `whatsapp_config_json` TEXT,
  `sms_provider` TEXT DEFAULT 'generic_http' CHECK(`sms_provider` IN ('generic_http')),
  `sms_config_json` TEXT,
  `push_provider` TEXT DEFAULT 'web_push' CHECK(`push_provider` IN ('web_push')),
  `push_config_json` TEXT,
  `is_active` INTEGER DEFAULT 1 NOT NULL CHECK(`is_active` IN (0, 1)),
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);
INSERT INTO `__new_tenant_notification_configs` SELECT * FROM `tenant_notification_configs`;
DROP TABLE `tenant_notification_configs`;
ALTER TABLE `__new_tenant_notification_configs` RENAME TO `tenant_notification_configs`;
CREATE UNIQUE INDEX IF NOT EXISTS `uq_tenant_notif_config_tenant_id` ON `tenant_notification_configs`(`tenant_id`);
CREATE INDEX IF NOT EXISTS `idx_tenant_notif_config_active` ON `tenant_notification_configs`(`tenant_id`, `is_active`);

-- 9. Notification Logs: rebuild table without foreign key to tenants
CREATE TABLE `__new_notification_logs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `tenant_id` INTEGER NOT NULL,
  `channel` TEXT NOT NULL CHECK(`channel` IN ('email', 'whatsapp', 'sms', 'push')),
  `provider` TEXT NOT NULL,
  `recipient` TEXT NOT NULL,
  `subject` TEXT,
  `body` TEXT NOT NULL,
  `template_id` TEXT,
  `status` TEXT NOT NULL CHECK(`status` IN ('queued', 'sending', 'sent', 'failed')),
  `provider_message_id` TEXT,
  `error_message` TEXT,
  `retry_count` INTEGER DEFAULT 0 NOT NULL,
  `idempotency_key` TEXT,
  `metadata_json` TEXT,
  `created_at` TEXT NOT NULL,
  `sent_at` TEXT
);
INSERT INTO `__new_notification_logs` SELECT * FROM `notification_logs`;
DROP TABLE `notification_logs`;
ALTER TABLE `__new_notification_logs` RENAME TO `notification_logs`;
CREATE INDEX IF NOT EXISTS `idx_notif_logs_tenant_created` ON `notification_logs`(`tenant_id`, `created_at` DESC);
CREATE INDEX IF NOT EXISTS `idx_notif_logs_status_created` ON `notification_logs`(`status`, `created_at` DESC);
CREATE INDEX IF NOT EXISTS `idx_notif_logs_idempotency` ON `notification_logs`(`tenant_id`, `idempotency_key`);

-- 10. Drop branches and tenants tables completely from D1
DROP TABLE IF EXISTS `branches`;
DROP TABLE IF EXISTS `tenants`;

-- 11. Restore triggers dropped during table renames
CREATE TRIGGER `trg_invoices_immutable_financials`
BEFORE UPDATE ON `invoices`
WHEN OLD.`status` != 'draft'
  AND (
    NEW.`subtotal_paise` != OLD.`subtotal_paise`
    OR NEW.`discount_paise` != OLD.`discount_paise`
    OR NEW.`taxable_amount_paise` != OLD.`taxable_amount_paise`
    OR NEW.`cgst_paise` != OLD.`cgst_paise`
    OR NEW.`sgst_paise` != OLD.`sgst_paise`
    OR NEW.`igst_paise` != OLD.`igst_paise`
    OR NEW.`total_tax_paise` != OLD.`total_tax_paise`
    OR NEW.`total_amount_paise` != OLD.`total_amount_paise`
    OR NEW.`supplier_state_code` != OLD.`supplier_state_code`
    OR NEW.`place_of_supply_state_code` != OLD.`place_of_supply_state_code`
    OR NEW.`tax_supply_type` != OLD.`tax_supply_type`
    OR NEW.`invoice_number` != OLD.`invoice_number`
  )
BEGIN
  SELECT RAISE(ABORT, 'Issued invoice financial and GST snapshot fields are immutable');
END;

CREATE TRIGGER `trg_invoices_no_delete`
BEFORE DELETE ON `invoices`
WHEN OLD.`status` != 'draft'
BEGIN
  SELECT RAISE(ABORT, 'Issued invoices cannot be hard-deleted');
END;

CREATE TRIGGER `trg_orders_no_delete`
BEFORE DELETE ON `orders`
BEGIN
  SELECT RAISE(ABORT, 'Orders cannot be hard-deleted');
END;

CREATE TRIGGER `trg_payments_no_delete`
BEFORE DELETE ON `payments`
BEGIN
  SELECT RAISE(ABORT, 'Payments cannot be hard-deleted');
END;

PRAGMA foreign_keys=ON;
