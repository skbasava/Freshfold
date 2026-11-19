CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`setting_key` text NOT NULL,
	`setting_value_json` text NOT NULL,
	`description` text,
	`updated_by_user_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_app_settings_key` ON `app_settings` (`setting_key`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`request_id` text,
	`summary_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created_at` ON `audit_logs` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_entity` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`legal_name` text NOT NULL,
	`gstin` text,
	`state_code` text NOT NULL,
	`address_line1` text NOT NULL,
	`address_line2` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`postal_code` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "chk_branches_is_default" CHECK("branches"."is_default" IN (0, 1)),
	CONSTRAINT "chk_branches_is_active" CHECK("branches"."is_active" IN (0, 1)),
	CONSTRAINT "chk_branches_state_code_len" CHECK(length("branches"."state_code") = 2)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_branches_code` ON `branches` (`code`);--> statement-breakpoint
CREATE INDEX `idx_branches_active` ON `branches` (`is_active`);--> statement-breakpoint
CREATE TABLE `customer_addresses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`address_type` text DEFAULT 'home' NOT NULL,
	`label` text,
	`line1` text NOT NULL,
	`line2` text,
	`landmark` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`state_code` text NOT NULL,
	`postal_code` text NOT NULL,
	`is_default_pickup` integer DEFAULT false NOT NULL,
	`is_default_delivery` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_customer_addresses_type" CHECK("customer_addresses"."address_type" IN ('home', 'office', 'pickup', 'delivery', 'other')),
	CONSTRAINT "chk_customer_addresses_pickup_flag" CHECK("customer_addresses"."is_default_pickup" IN (0, 1)),
	CONSTRAINT "chk_customer_addresses_delivery_flag" CHECK("customer_addresses"."is_default_delivery" IN (0, 1)),
	CONSTRAINT "chk_customer_addresses_state_code" CHECK(length("customer_addresses"."state_code") = 2)
);
--> statement-breakpoint
CREATE INDEX `idx_customer_addresses_customer_id` ON `customer_addresses` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customer_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`detergent_preference` text,
	`starch_level` text,
	`fold_or_hanger` text,
	`fragrance_free` integer DEFAULT false NOT NULL,
	`special_instructions` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_customer_preferences_fragrance" CHECK("customer_preferences"."fragrance_free" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_customer_preferences_customer_id` ON `customer_preferences` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customer_rate_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`rate_card_id` integer NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rate_card_id`) REFERENCES `rate_cards`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_crc_is_active" CHECK("customer_rate_cards"."is_active" IN (0, 1)),
	CONSTRAINT "chk_crc_effective_range" CHECK("customer_rate_cards"."effective_to" IS NULL OR "customer_rate_cards"."effective_to" >= "customer_rate_cards"."effective_from")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_customer_rate_cards_active_open` ON `customer_rate_cards` (`customer_id`) WHERE "customer_rate_cards"."is_active" = 1 AND "customer_rate_cards"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_customer_rate_cards_lookup` ON `customer_rate_cards` (`customer_id`,`is_active`,`effective_from`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer NOT NULL,
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
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_customers_is_active" CHECK("customers"."is_active" IN (0, 1)),
	CONSTRAINT "chk_customers_state_code" CHECK("customers"."state_code" IS NULL OR length("customers"."state_code") = 2)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_customers_code` ON `customers` (`customer_code`);--> statement-breakpoint
CREATE INDEX `idx_customers_phone` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_customers_branch_created` ON `customers` (`branch_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer NOT NULL,
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
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_address_id`) REFERENCES `customer_addresses`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_deliveries_type" CHECK("deliveries"."delivery_type" IN ('pickup', 'delivery')),
	CONSTRAINT "chk_deliveries_status" CHECK("deliveries"."status" IN ('scheduled', 'dispatched', 'in_transit', 'completed', 'failed', 'rescheduled', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `idx_deliveries_status_scheduled` ON `deliveries` (`status`,`scheduled_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_order_id` ON `deliveries` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_customer_id` ON `deliveries` (`customer_id`);--> statement-breakpoint
CREATE TABLE `delivery_status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` integer NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`reason` text,
	`changed_by_user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_dsh_to_status" CHECK("delivery_status_history"."to_status" IN ('scheduled', 'dispatched', 'in_transit', 'completed', 'failed', 'rescheduled', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `idx_delivery_status_history_delivery_created` ON `delivery_status_history` (`delivery_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_status` integer NOT NULL,
	`response_body_json` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_idempotency_operation_key` ON `idempotency_keys` (`operation`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_idempotency_expires_at` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`order_item_id` integer,
	`description` text NOT NULL,
	`hsn_sac_code` text NOT NULL,
	`pricing_basis` text NOT NULL,
	`quantity_pieces` integer,
	`weight_grams` integer,
	`unit_price_paise` integer NOT NULL,
	`gross_amount_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`taxable_amount_paise` integer NOT NULL,
	`tax_rate_bps` integer NOT NULL,
	`cgst_rate_bps` integer NOT NULL,
	`sgst_rate_bps` integer NOT NULL,
	`igst_rate_bps` integer NOT NULL,
	`cgst_amount_paise` integer NOT NULL,
	`sgst_amount_paise` integer NOT NULL,
	`igst_amount_paise` integer NOT NULL,
	`total_tax_paise` integer NOT NULL,
	`line_total_paise` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_ii_pricing_basis" CHECK("invoice_items"."pricing_basis" IN ('per_item', 'per_kg')),
	CONSTRAINT "chk_ii_unit_price_non_neg" CHECK("invoice_items"."unit_price_paise" >= 0),
	CONSTRAINT "chk_ii_gross_non_neg" CHECK("invoice_items"."gross_amount_paise" >= 0),
	CONSTRAINT "chk_ii_discount_non_neg" CHECK("invoice_items"."discount_paise" >= 0),
	CONSTRAINT "chk_ii_taxable_non_neg" CHECK("invoice_items"."taxable_amount_paise" >= 0),
	CONSTRAINT "chk_ii_total_non_neg" CHECK("invoice_items"."line_total_paise" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_items_invoice_id` ON `invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_invoice_items_order_item_id` ON `invoice_items` (`order_item_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer NOT NULL,
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
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_invoices_status" CHECK("invoices"."status" IN ('draft', 'issued', 'partially_paid', 'paid', 'void')),
	CONSTRAINT "chk_invoices_supply_type" CHECK("invoices"."tax_supply_type" IN ('intra_state', 'inter_state', 'exempt')),
	CONSTRAINT "chk_invoices_subtotal_non_neg" CHECK("invoices"."subtotal_paise" >= 0),
	CONSTRAINT "chk_invoices_discount_non_neg" CHECK("invoices"."discount_paise" >= 0),
	CONSTRAINT "chk_invoices_taxable_non_neg" CHECK("invoices"."taxable_amount_paise" >= 0),
	CONSTRAINT "chk_invoices_total_non_neg" CHECK("invoices"."total_amount_paise" >= 0),
	CONSTRAINT "chk_invoices_paid_non_neg" CHECK("invoices"."paid_amount_paise" >= 0),
	CONSTRAINT "chk_invoices_balance_non_neg" CHECK("invoices"."balance_due_paise" >= 0),
	CONSTRAINT "chk_invoices_supplier_state_len" CHECK(length("invoices"."supplier_state_code") = 2),
	CONSTRAINT "chk_invoices_pos_state_len" CHECK(length("invoices"."place_of_supply_state_code") = 2)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_invoices_invoice_number` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `idx_invoices_customer_created` ON `invoices` (`customer_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_order_id` ON `invoices` (`order_id`);--> statement-breakpoint
CREATE TABLE `item_attributes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`attribute_key` text NOT NULL,
	`attribute_value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_attributes_item_key` ON `item_attributes` (`item_id`,`attribute_key`);--> statement-breakpoint
CREATE INDEX `idx_item_attributes_item_id` ON `item_attributes` (`item_id`);--> statement-breakpoint
CREATE TABLE `item_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "chk_item_categories_is_active" CHECK("item_categories"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_categories_code` ON `item_categories` (`code`);--> statement-breakpoint
CREATE INDEX `idx_item_categories_active_sort` ON `item_categories` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`hsn_sac_code` text,
	`image_r2_key` text,
	`image_content_type` text,
	`image_size_bytes` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `item_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_items_is_active" CHECK("items"."is_active" IN (0, 1)),
	CONSTRAINT "chk_items_image_size" CHECK("items"."image_size_bytes" IS NULL OR "items"."image_size_bytes" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_items_code` ON `items` (`code`);--> statement-breakpoint
CREATE INDEX `idx_items_category_active` ON `items` (`category_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `order_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`adjustment_type` text NOT NULL,
	`description` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`created_by_user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_order_adjustments_type" CHECK("order_adjustments"."adjustment_type" IN ('discount', 'surcharge', 'express_fee', 'delivery_fee', 'rounding'))
);
--> statement-breakpoint
CREATE INDEX `idx_order_adjustments_order_id` ON `order_adjustments` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	`item_id` integer,
	`tax_rate_id` integer NOT NULL,
	`service_name_snapshot` text NOT NULL,
	`item_name_snapshot` text,
	`hsn_sac_code_snapshot` text NOT NULL,
	`pricing_basis` text NOT NULL,
	`quantity_pieces` integer,
	`weight_grams` integer,
	`unit_price_paise` integer NOT NULL,
	`gross_amount_paise` integer NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`taxable_amount_paise` integer NOT NULL,
	`tax_rate_bps` integer NOT NULL,
	`cgst_rate_bps` integer NOT NULL,
	`sgst_rate_bps` integer NOT NULL,
	`igst_rate_bps` integer NOT NULL,
	`cgst_amount_paise` integer NOT NULL,
	`sgst_amount_paise` integer NOT NULL,
	`igst_amount_paise` integer NOT NULL,
	`total_tax_paise` integer NOT NULL,
	`line_total_paise` integer NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_oi_pricing_basis" CHECK("order_items"."pricing_basis" IN ('per_item', 'per_kg')),
	CONSTRAINT "chk_oi_quantity_matches_basis" CHECK(("order_items"."pricing_basis" = 'per_item' AND "order_items"."quantity_pieces" > 0 AND "order_items"."weight_grams" IS NULL) OR ("order_items"."pricing_basis" = 'per_kg' AND "order_items"."weight_grams" > 0 AND "order_items"."quantity_pieces" IS NULL)),
	CONSTRAINT "chk_oi_unit_price_non_neg" CHECK("order_items"."unit_price_paise" >= 0),
	CONSTRAINT "chk_oi_gross_non_neg" CHECK("order_items"."gross_amount_paise" >= 0),
	CONSTRAINT "chk_oi_discount_non_neg" CHECK("order_items"."discount_paise" >= 0),
	CONSTRAINT "chk_oi_taxable_non_neg" CHECK("order_items"."taxable_amount_paise" >= 0),
	CONSTRAINT "chk_oi_tax_bps" CHECK("order_items"."tax_rate_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "chk_oi_total_non_neg" CHECK("order_items"."line_total_paise" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_order_items_order_id` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`note` text NOT NULL,
	`is_internal` integer DEFAULT true NOT NULL,
	`created_by_user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_order_notes_is_internal" CHECK("order_notes"."is_internal" IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `idx_order_notes_order_id` ON `order_notes` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`reason` text,
	`changed_by_user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_osh_to_status" CHECK("order_status_history"."to_status" IN ('draft', 'confirmed', 'pickup_scheduled', 'picked_up', 'received', 'processing', 'ready', 'out_for_delivery', 'delivered', 'hold', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `idx_order_status_history_order_created` ON `order_status_history` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer NOT NULL,
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
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`rate_card_id`) REFERENCES `rate_cards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pickup_address_id`) REFERENCES `customer_addresses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`delivery_address_id`) REFERENCES `customer_addresses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_orders_status" CHECK("orders"."status" IN ('draft', 'confirmed', 'pickup_scheduled', 'picked_up', 'received', 'processing', 'ready', 'out_for_delivery', 'delivered', 'hold', 'cancelled')),
	CONSTRAINT "chk_orders_supply_type" CHECK("orders"."tax_supply_type" IN ('intra_state', 'inter_state', 'exempt')),
	CONSTRAINT "chk_orders_subtotal_non_neg" CHECK("orders"."subtotal_paise" >= 0),
	CONSTRAINT "chk_orders_discount_non_neg" CHECK("orders"."discount_paise" >= 0),
	CONSTRAINT "chk_orders_taxable_non_neg" CHECK("orders"."taxable_amount_paise" >= 0),
	CONSTRAINT "chk_orders_cgst_non_neg" CHECK("orders"."cgst_paise" >= 0),
	CONSTRAINT "chk_orders_sgst_non_neg" CHECK("orders"."sgst_paise" >= 0),
	CONSTRAINT "chk_orders_igst_non_neg" CHECK("orders"."igst_paise" >= 0),
	CONSTRAINT "chk_orders_total_tax_non_neg" CHECK("orders"."total_tax_paise" >= 0),
	CONSTRAINT "chk_orders_total_non_neg" CHECK("orders"."total_amount_paise" >= 0),
	CONSTRAINT "chk_orders_supplier_state_len" CHECK(length("orders"."supplier_state_code") = 2),
	CONSTRAINT "chk_orders_pos_state_len" CHECK(length("orders"."place_of_supply_state_code") = 2)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_orders_order_number` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `idx_orders_customer_created` ON `orders` (`customer_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_orders_status_created` ON `orders` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_orders_branch_created` ON `orders` (`branch_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_id` integer NOT NULL,
	`invoice_id` integer NOT NULL,
	`amount_paise` integer NOT NULL,
	`allocated_by_user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`allocated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_payment_allocations_amount_pos" CHECK("payment_allocations"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_payment_allocations_invoice_id` ON `payment_allocations` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_allocations_payment_id` ON `payment_allocations` (`payment_id`);--> statement-breakpoint
CREATE TABLE `payment_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_id` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_reference` text NOT NULL,
	`provider_event_id` text,
	`transaction_type` text NOT NULL,
	`status` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`failure_code` text,
	`failure_message` text,
	`metadata_json` text,
	`processed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_pt_status" CHECK("payment_transactions"."status" IN ('initiated', 'pending', 'succeeded', 'failed', 'reversed')),
	CONSTRAINT "chk_pt_amount_pos" CHECK("payment_transactions"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_payment_transactions_payment_id` ON `payment_transactions` (`payment_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_transactions_provider_ref` ON `payment_transactions` (`provider`,`provider_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payment_transactions_provider_event` ON `payment_transactions` (`provider`,`provider_event_id`) WHERE "payment_transactions"."provider_event_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer NOT NULL,
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
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_payments_method" CHECK("payments"."payment_method" IN ('cash', 'upi', 'card', 'bank_transfer', 'online_gateway')),
	CONSTRAINT "chk_payments_status" CHECK("payments"."status" IN ('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'cancelled')),
	CONSTRAINT "chk_payments_amount_pos" CHECK("payments"."amount_paise" > 0),
	CONSTRAINT "chk_payments_captured_non_neg" CHECK("payments"."captured_amount_paise" >= 0),
	CONSTRAINT "chk_payments_refunded_non_neg" CHECK("payments"."refunded_amount_paise" >= 0),
	CONSTRAINT "chk_payments_refunded_le_captured" CHECK("payments"."refunded_amount_paise" <= "payments"."captured_amount_paise")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payments_payment_number` ON `payments` (`payment_number`);--> statement-breakpoint
CREATE INDEX `idx_payments_customer_created` ON `payments` (`customer_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_payments_order_id` ON `payments` (`order_id`);--> statement-breakpoint
CREATE TABLE `rate_card_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rate_card_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	`item_id` integer,
	`tax_rate_id` integer NOT NULL,
	`pricing_basis` text NOT NULL,
	`pricing_key` text NOT NULL,
	`unit_price_paise` integer NOT NULL,
	`min_quantity` integer,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`rate_card_id`) REFERENCES `rate_cards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_rci_pricing_basis" CHECK("rate_card_items"."pricing_basis" IN ('per_item', 'per_kg')),
	CONSTRAINT "chk_rci_per_item_requires_item" CHECK("rate_card_items"."pricing_basis" = 'per_kg' OR "rate_card_items"."item_id" IS NOT NULL),
	CONSTRAINT "chk_rci_unit_price_non_neg" CHECK("rate_card_items"."unit_price_paise" >= 0),
	CONSTRAINT "chk_rci_min_quantity_pos" CHECK("rate_card_items"."min_quantity" IS NULL OR "rate_card_items"."min_quantity" > 0),
	CONSTRAINT "chk_rci_effective_range" CHECK("rate_card_items"."effective_to" IS NULL OR "rate_card_items"."effective_to" >= "rate_card_items"."effective_from"),
	CONSTRAINT "chk_rci_is_active" CHECK("rate_card_items"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rate_card_items_key_from` ON `rate_card_items` (`rate_card_id`,`pricing_key`,`effective_from`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rate_card_items_open_active` ON `rate_card_items` (`rate_card_id`,`pricing_key`) WHERE "rate_card_items"."is_active" = 1 AND "rate_card_items"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_rate_card_items_lookup` ON `rate_card_items` (`rate_card_id`,`pricing_key`,`is_active`,`effective_from`);--> statement-breakpoint
CREATE INDEX `idx_rate_card_items_service` ON `rate_card_items` (`service_id`);--> statement-breakpoint
CREATE TABLE `rate_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer NOT NULL,
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
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_rate_cards_is_default" CHECK("rate_cards"."is_default" IN (0, 1)),
	CONSTRAINT "chk_rate_cards_is_active" CHECK("rate_cards"."is_active" IN (0, 1)),
	CONSTRAINT "chk_rate_cards_effective_range" CHECK("rate_cards"."effective_to" IS NULL OR "rate_cards"."effective_to" >= "rate_cards"."effective_from")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rate_cards_code` ON `rate_cards` (`code`);--> statement-breakpoint
CREATE INDEX `idx_rate_cards_branch_default` ON `rate_cards` (`branch_id`,`is_default`,`is_active`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_id` integer NOT NULL,
	`invoice_id` integer,
	`refund_number` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount_paise` integer NOT NULL,
	`reason` text NOT NULL,
	`provider_refund_reference` text,
	`processed_at` text,
	`created_by_user_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chk_refunds_status" CHECK("refunds"."status" IN ('pending', 'processed', 'failed', 'cancelled')),
	CONSTRAINT "chk_refunds_amount_pos" CHECK("refunds"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_refunds_refund_number` ON `refunds` (`refund_number`);--> statement-breakpoint
CREATE INDEX `idx_refunds_payment_id` ON `refunds` (`payment_id`);--> statement-breakpoint
CREATE INDEX `idx_refunds_invoice_id` ON `refunds` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "chk_roles_is_active" CHECK("roles"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_roles_code` ON `roles` (`code`);--> statement-breakpoint
CREATE TABLE `service_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "chk_service_categories_is_active" CHECK("service_categories"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_service_categories_code` ON `service_categories` (`code`);--> statement-breakpoint
CREATE INDEX `idx_service_categories_active_sort` ON `service_categories` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`default_pricing_basis` text NOT NULL,
	`default_tax_rate_id` integer,
	`turnaround_hours` integer DEFAULT 48 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `service_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_services_pricing_basis" CHECK("services"."default_pricing_basis" IN ('per_item', 'per_kg')),
	CONSTRAINT "chk_services_turnaround_positive" CHECK("services"."turnaround_hours" > 0),
	CONSTRAINT "chk_services_is_active" CHECK("services"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_services_code` ON `services` (`code`);--> statement-breakpoint
CREATE INDEX `idx_services_category_active` ON `services` (`category_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `tax_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`hsn_sac_code` text NOT NULL,
	`total_rate_bps` integer NOT NULL,
	`cgst_rate_bps` integer NOT NULL,
	`sgst_rate_bps` integer NOT NULL,
	`igst_rate_bps` integer NOT NULL,
	`is_exempt` integer DEFAULT false NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "chk_tax_rates_total_bps" CHECK("tax_rates"."total_rate_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "chk_tax_rates_cgst_bps" CHECK("tax_rates"."cgst_rate_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "chk_tax_rates_sgst_bps" CHECK("tax_rates"."sgst_rate_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "chk_tax_rates_igst_bps" CHECK("tax_rates"."igst_rate_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "chk_tax_rates_split_valid" CHECK(("tax_rates"."is_exempt" = 1 AND "tax_rates"."total_rate_bps" = 0 AND "tax_rates"."cgst_rate_bps" = 0 AND "tax_rates"."sgst_rate_bps" = 0 AND "tax_rates"."igst_rate_bps" = 0) OR ("tax_rates"."is_exempt" = 0 AND "tax_rates"."cgst_rate_bps" + "tax_rates"."sgst_rate_bps" = "tax_rates"."total_rate_bps" AND "tax_rates"."igst_rate_bps" = "tax_rates"."total_rate_bps")),
	CONSTRAINT "chk_tax_rates_effective_range" CHECK("tax_rates"."effective_to" IS NULL OR "tax_rates"."effective_to" >= "tax_rates"."effective_from"),
	CONSTRAINT "chk_tax_rates_is_exempt" CHECK("tax_rates"."is_exempt" IN (0, 1)),
	CONSTRAINT "chk_tax_rates_is_active" CHECK("tax_rates"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tax_rates_code_from` ON `tax_rates` (`code`,`effective_from`);--> statement-breakpoint
CREATE INDEX `idx_tax_rates_active_effective` ON `tax_rates` (`is_active`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	`assigned_by_user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_roles_user_role` ON `user_roles` (`user_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `idx_user_roles_role_id` ON `user_roles` (`role_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer NOT NULL,
	`supabase_user_id` text NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "chk_users_is_active" CHECK("users"."is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_supabase_user_id` ON `users` (`supabase_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_branch_active` ON `users` (`branch_id`,`is_active`);