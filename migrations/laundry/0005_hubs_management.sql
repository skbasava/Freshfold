-- 0005_hubs_management.sql
-- Multi-Hub Management, Metadata Extensibility & Tenant-scoped Uniqueness

-- 1. Hubs metadata extensibility
ALTER TABLE hubs ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json));

-- 2. Tenant-scoped unique hub code (enforcing unique active codes per tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_hubs_tenant_code_unique ON hubs(tenant_id, code) WHERE deleted_at IS NULL;

-- 3. Indexes for efficient listing and sorting by creation/update time
CREATE INDEX IF NOT EXISTS idx_hubs_tenant_created ON hubs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hubs_tenant_updated ON hubs(tenant_id, updated_at DESC);

