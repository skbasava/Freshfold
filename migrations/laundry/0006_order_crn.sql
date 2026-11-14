-- 0006_order_crn.sql
-- CRN (Compact Reference Number) & Sequence Infrastructure for Orders

-- 1. Tenants numeric sequence ID for 9-bit packing (0..511)
ALTER TABLE tenants ADD COLUMN seq_id INTEGER;

-- 2. Hubs numeric sequence ID for 4-bit packing (0..15)
ALTER TABLE hubs ADD COLUMN seq_id INTEGER;

-- 3. Orders CRN identifiers (32-bit compact bitfield & string URN)
ALTER TABLE orders ADD COLUMN crn_id TEXT;
ALTER TABLE orders ADD COLUMN crn_packed INTEGER;
ALTER TABLE orders ADD COLUMN seq_id INTEGER;

-- 4. Hub Order Sequence Counters for atomic, monotonic 19-bit order sequence generation
CREATE TABLE IF NOT EXISTS hub_order_counters (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  hub_id TEXT NOT NULL REFERENCES hubs(id),
  next_order_seq INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, hub_id)
);

-- 5. Indexes for fast lookup by CRN and sequence
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_crn_id_unique ON orders(crn_id) WHERE crn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_crn_packed ON orders(crn_packed) WHERE crn_packed IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_seq_id ON tenants(seq_id) WHERE seq_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hubs_tenant_seq_id ON hubs(tenant_id, seq_id) WHERE seq_id IS NOT NULL;

-- 6. Backfill existing tenants and hubs seq_id if null
UPDATE tenants SET seq_id = 1 WHERE seq_id IS NULL;
UPDATE hubs SET seq_id = 0 WHERE seq_id IS NULL;

