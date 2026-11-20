-- Seed remote production D1 database with baseline FreshFold data

-- 1. Default Tenant
INSERT OR IGNORE INTO tenants (id, code, name, slug, plan_tier, status, contact_email, contact_phone, created_at, updated_at)
VALUES (1, 'TENANT-001', 'FreshFold India', 'freshfold-india', 'enterprise', 'active', 'admin@freshfold.in', '+919900000000', datetime('now'), datetime('now'));

-- 2. Default Branch (Hub)
INSERT OR IGNORE INTO branches (id, tenant_id, code, name, legal_name, gstin, state_code, address_line1, city, state, postal_code, phone, email, is_default, is_active, created_at, updated_at)
VALUES (1, 1, 'MAIN', 'FreshFold Main Branch', 'FreshFold Laundry Services', NULL, '29', 'Main Operations Center', 'Bengaluru', 'Karnataka', '560001', '+919900000001', 'ops@freshfold.local', 1, 1, datetime('now'), datetime('now'));

-- 3. Roles
INSERT OR IGNORE INTO roles (id, code, name, description, is_active, created_at, updated_at) VALUES (1, 'super_admin', 'Super Admin', 'Full system administration', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO roles (id, code, name, description, is_active, created_at, updated_at) VALUES (2, 'admin', 'Admin', 'Branch configuration, pricing, and billing', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO roles (id, code, name, description, is_active, created_at, updated_at) VALUES (3, 'manager', 'Manager', 'Daily operations, orders, and invoicing', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO roles (id, code, name, description, is_active, created_at, updated_at) VALUES (4, 'front_desk', 'Front Desk', 'Customer intake and order counter', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO roles (id, code, name, description, is_active, created_at, updated_at) VALUES (5, 'service', 'Service', 'Internal service integrations', 1, datetime('now'), datetime('now'));

-- 4. App Settings
INSERT OR IGNORE INTO app_settings (setting_key, setting_value_json, description, created_at, updated_at)
VALUES ('business.currency', '"INR"', 'Base accounting currency', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO app_settings (setting_key, setting_value_json, description, created_at, updated_at)
VALUES ('business.timezone', '"Asia/Kolkata"', 'Operational timezone', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO app_settings (setting_key, setting_value_json, description, created_at, updated_at)
VALUES ('business.multi_branch_enabled', 'false', 'Single-branch mode', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO app_settings (setting_key, setting_value_json, description, created_at, updated_at)
VALUES ('gst.tax_advisor_review_required', 'true', 'GST review flag', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO app_settings (setting_key, setting_value_json, description, created_at, updated_at)
VALUES ('storage.d1_ceiling_bytes', '524288000', 'D1 storage ceiling', datetime('now'), datetime('now'));

-- 5. Tax Rates
INSERT OR IGNORE INTO tax_rates (id, code, name, hsn_sac_code, total_rate_bps, cgst_rate_bps, sgst_rate_bps, igst_rate_bps, is_exempt, effective_from, is_active, created_at, updated_at)
VALUES (1, 'GST_18_PLACEHOLDER', 'GST 18% (Placeholder)', '999712', 1800, 900, 900, 1800, 0, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO tax_rates (id, code, name, hsn_sac_code, total_rate_bps, cgst_rate_bps, sgst_rate_bps, igst_rate_bps, is_exempt, effective_from, is_active, created_at, updated_at)
VALUES (2, 'GST_5_PLACEHOLDER', 'GST 5% (Placeholder)', '999711', 500, 250, 250, 500, 0, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO tax_rates (id, code, name, hsn_sac_code, total_rate_bps, cgst_rate_bps, sgst_rate_bps, igst_rate_bps, is_exempt, effective_from, is_active, created_at, updated_at)
VALUES (3, 'GST_EXEMPT', 'GST Exempt 0%', '999719', 0, 0, 0, 0, 1, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));

-- 6. Service Categories & Services
INSERT OR IGNORE INTO service_categories (id, code, name, sort_order, is_active, created_at, updated_at) VALUES (1, 'LAUNDRY', 'Everyday Laundry', 1, 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO service_categories (id, code, name, sort_order, is_active, created_at, updated_at) VALUES (2, 'DRY_CLEAN', 'Dry Cleaning', 2, 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO service_categories (id, code, name, sort_order, is_active, created_at, updated_at) VALUES (3, 'PRESSING', 'Ironing & Steam Press', 3, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO services (id, category_id, code, name, default_pricing_basis, default_tax_rate_id, turnaround_hours, is_active, created_at, updated_at) VALUES (1, 1, 'WASH_FOLD', 'Wash & Fold', 'per_item', 1, 48, 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO services (id, category_id, code, name, default_pricing_basis, default_tax_rate_id, turnaround_hours, is_active, created_at, updated_at) VALUES (2, 1, 'WASH_IRON', 'Wash & Iron', 'per_item', 1, 48, 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO services (id, category_id, code, name, default_pricing_basis, default_tax_rate_id, turnaround_hours, is_active, created_at, updated_at) VALUES (3, 2, 'DRY_CLEAN', 'Dry Clean', 'per_item', 1, 72, 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO services (id, category_id, code, name, default_pricing_basis, default_tax_rate_id, turnaround_hours, is_active, created_at, updated_at) VALUES (4, 3, 'STEAM_IRON', 'Steam Iron', 'per_item', 2, 24, 1, datetime('now'), datetime('now'));

-- 7. Item Categories & Items
INSERT OR IGNORE INTO item_categories (id, code, name, sort_order, is_active, created_at, updated_at) VALUES (1, 'GARMENTS', 'Apparel & Garments', 1, 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO item_categories (id, code, name, sort_order, is_active, created_at, updated_at) VALUES (2, 'HOUSEHOLD', 'Bedding & Household', 2, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO items (id, category_id, code, name, hsn_sac_code, is_active, created_at, updated_at) VALUES (1, 1, 'SHIRT', 'Shirt', '999712', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO items (id, category_id, code, name, hsn_sac_code, is_active, created_at, updated_at) VALUES (2, 1, 'TROUSER', 'Trouser', '999712', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO items (id, category_id, code, name, hsn_sac_code, is_active, created_at, updated_at) VALUES (3, 1, 'SAREE', 'Silk Saree', '999712', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO items (id, category_id, code, name, hsn_sac_code, is_active, created_at, updated_at) VALUES (4, 1, 'SUIT', 'Two-Piece Suit', '999712', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO items (id, category_id, code, name, hsn_sac_code, is_active, created_at, updated_at) VALUES (5, 2, 'BEDSHEET', 'Bedsheet', '999712', 1, datetime('now'), datetime('now'));

-- 8. Rate Card & Items
INSERT OR IGNORE INTO rate_cards (id, tenant_id, branch_id, code, name, description, is_default, is_active, effective_from, created_at, updated_at)
VALUES (1, 1, 1, 'RC-DEFAULT-MAIN', 'Standard Counter Rate Card', 'Default rate card for Bengaluru operations', 1, 1, '2026-01-01T00:00:00.000Z', datetime('now'), datetime('now'));

-- Shirt pricing (Wash & Fold: ₹60, Wash & Iron: ₹90, Dry Clean: ₹150, Steam Iron: ₹30)
INSERT OR IGNORE INTO rate_card_items (rate_card_id, service_id, item_id, tax_rate_id, pricing_basis, pricing_key, unit_price_paise, effective_from, is_active, created_at, updated_at)
VALUES (1, 1, 1, 1, 'per_item', '1:1:per_item', 6000, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO rate_card_items (rate_card_id, service_id, item_id, tax_rate_id, pricing_basis, pricing_key, unit_price_paise, effective_from, is_active, created_at, updated_at)
VALUES (1, 2, 1, 1, 'per_item', '2:1:per_item', 9000, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO rate_card_items (rate_card_id, service_id, item_id, tax_rate_id, pricing_basis, pricing_key, unit_price_paise, effective_from, is_active, created_at, updated_at)
VALUES (1, 3, 1, 1, 'per_item', '3:1:per_item', 15000, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO rate_card_items (rate_card_id, service_id, item_id, tax_rate_id, pricing_basis, pricing_key, unit_price_paise, effective_from, is_active, created_at, updated_at)
VALUES (1, 4, 1, 2, 'per_item', '4:1:per_item', 3000, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));

-- Saree pricing (Dry Clean: ₹280, Steam Iron: ₹80)
INSERT OR IGNORE INTO rate_card_items (rate_card_id, service_id, item_id, tax_rate_id, pricing_basis, pricing_key, unit_price_paise, effective_from, is_active, created_at, updated_at)
VALUES (1, 3, 3, 1, 'per_item', '3:3:per_item', 28000, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO rate_card_items (rate_card_id, service_id, item_id, tax_rate_id, pricing_basis, pricing_key, unit_price_paise, effective_from, is_active, created_at, updated_at)
VALUES (1, 4, 3, 2, 'per_item', '4:3:per_item', 8000, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));

-- Trouser pricing
INSERT OR IGNORE INTO rate_card_items (rate_card_id, service_id, item_id, tax_rate_id, pricing_basis, pricing_key, unit_price_paise, effective_from, is_active, created_at, updated_at)
VALUES (1, 1, 2, 1, 'per_item', '1:2:per_item', 6000, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO rate_card_items (rate_card_id, service_id, item_id, tax_rate_id, pricing_basis, pricing_key, unit_price_paise, effective_from, is_active, created_at, updated_at)
VALUES (1, 2, 2, 1, 'per_item', '2:2:per_item', 9000, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));
INSERT OR IGNORE INTO rate_card_items (rate_card_id, service_id, item_id, tax_rate_id, pricing_basis, pricing_key, unit_price_paise, effective_from, is_active, created_at, updated_at)
VALUES (1, 3, 2, 1, 'per_item', '3:2:per_item', 15000, '2026-01-01T00:00:00.000Z', 1, datetime('now'), datetime('now'));

-- 9. Sample Customer
INSERT OR IGNORE INTO customers (id, tenant_id, branch_id, customer_code, full_name, phone, email, state_code, is_active, created_at, updated_at)
VALUES (1, 1, 1, 'CUST-001', 'Anand Kumar', '+919876543210', 'anand@example.com', '29', 1, datetime('now'), datetime('now'));

-- 10. Provision Staff Accounts
INSERT OR IGNORE INTO users (tenant_id, branch_id, supabase_user_id, email, full_name, is_active, created_at, updated_at)
VALUES (1, 1, 'user-abhidigitech', 'abhidigitechblr@gmail.com', 'Store Manager', 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at)
SELECT u.id, r.id, datetime('now')
FROM users u, roles r
WHERE u.email = 'abhidigitechblr@gmail.com' AND r.code = 'manager';
