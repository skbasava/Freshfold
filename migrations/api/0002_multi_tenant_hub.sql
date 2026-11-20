-- Migration 0002: Multi-Tenant & Multi-Hub Hierarchy Support
-- 1. Create tenants table
-- 2. Seed default tenant
-- 3. Scope branches, customers, rate_cards, orders, and users to tenant_id

CREATE TABLE IF NOT EXISTS `tenants` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `slug` TEXT NOT NULL,
  `plan_tier` TEXT NOT NULL DEFAULT 'standard' CHECK(`plan_tier` IN ('trial', 'standard', 'pro', 'enterprise')),
  `status` TEXT NOT NULL DEFAULT 'active' CHECK(`status` IN ('active', 'suspended', 'trial', 'deleted')),
  `contact_email` TEXT,
  `contact_phone` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  `deleted_at` TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_tenants_code` ON `tenants`(`code`);
CREATE UNIQUE INDEX IF NOT EXISTS `uq_tenants_slug` ON `tenants`(`slug`);
CREATE INDEX IF NOT EXISTS `idx_tenants_status` ON `tenants`(`status`);

-- Seed default platform tenant for backward compatibility
INSERT OR IGNORE INTO `tenants` (`id`, `code`, `name`, `slug`, `plan_tier`, `status`, `created_at`, `updated_at`)
VALUES (1, 'TENANT-001', 'FreshFold India', 'freshfold-india', 'standard', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- Add tenant_id foreign keys to associate branches (hubs), customers, rate_cards, orders, and users
ALTER TABLE `branches` ADD COLUMN `tenant_id` INTEGER REFERENCES `tenants`(`id`) ON DELETE RESTRICT;
UPDATE `branches` SET `tenant_id` = 1 WHERE `tenant_id` IS NULL;

ALTER TABLE `customers` ADD COLUMN `tenant_id` INTEGER REFERENCES `tenants`(`id`) ON DELETE RESTRICT;
UPDATE `customers` SET `tenant_id` = 1 WHERE `tenant_id` IS NULL;

ALTER TABLE `rate_cards` ADD COLUMN `tenant_id` INTEGER REFERENCES `tenants`(`id`) ON DELETE RESTRICT;
UPDATE `rate_cards` SET `tenant_id` = 1 WHERE `tenant_id` IS NULL;

ALTER TABLE `orders` ADD COLUMN `tenant_id` INTEGER REFERENCES `tenants`(`id`) ON DELETE RESTRICT;
UPDATE `orders` SET `tenant_id` = 1 WHERE `tenant_id` IS NULL;

ALTER TABLE `users` ADD COLUMN `tenant_id` INTEGER REFERENCES `tenants`(`id`) ON DELETE RESTRICT;
UPDATE `users` SET `tenant_id` = 1 WHERE `tenant_id` IS NULL;

-- Indexes for high-velocity tenant and hub scoping
CREATE INDEX IF NOT EXISTS `idx_branches_tenant` ON `branches`(`tenant_id`, `is_active`);
CREATE INDEX IF NOT EXISTS `idx_customers_tenant_hub` ON `customers`(`tenant_id`, `branch_id`, `is_active`);
CREATE INDEX IF NOT EXISTS `idx_rate_cards_tenant_hub` ON `rate_cards`(`tenant_id`, `branch_id`, `is_default`, `is_active`);
CREATE INDEX IF NOT EXISTS `idx_orders_tenant_hub` ON `orders`(`tenant_id`, `branch_id`, `status`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_users_tenant_hub` ON `users`(`tenant_id`, `branch_id`, `is_active`);
