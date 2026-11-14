-- 0004_extensible_tenants.sql
-- Multi-Tenant Extensibility & Lifecycle Schema Enhancements

-- 1. Tenants enhancements for SaaS management & JSON configuration
ALTER TABLE tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'trial', 'deleted'));
ALTER TABLE tenants ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'standard' CHECK(plan_tier IN ('trial', 'standard', 'pro', 'enterprise'));
ALTER TABLE tenants ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json));
ALTER TABLE tenants ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json));
ALTER TABLE tenants ADD COLUMN contact_email TEXT;
ALTER TABLE tenants ADD COLUMN contact_phone TEXT;
ALTER TABLE tenants ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tenants ADD COLUMN deleted_at INTEGER;

-- 2. Hubs enhancements
ALTER TABLE hubs ADD COLUMN code TEXT;
ALTER TABLE hubs ADD COLUMN address TEXT;
ALTER TABLE hubs ADD COLUMN phone TEXT;
ALTER TABLE hubs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1));
ALTER TABLE hubs ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json));
ALTER TABLE hubs ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE hubs ADD COLUMN updated_at INTEGER;
ALTER TABLE hubs ADD COLUMN deleted_at INTEGER;

-- 3. Order Events tenant scoping
ALTER TABLE order_events ADD COLUMN tenant_id TEXT;

-- 4. Backfill updated_at on existing hubs and tenants if null
UPDATE tenants SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE hubs SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE hubs SET code = UPPER(SUBSTR(id, 1, 4)) WHERE code IS NULL;

-- 5. Extensible Indexes
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_hubs_tenant_active ON hubs(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone_lookup ON customers(tenant_id, phone_normalized);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_hub_active ON orders(tenant_id, hub_id, status);
CREATE INDEX IF NOT EXISTS idx_order_events_tenant ON order_events(tenant_id);

