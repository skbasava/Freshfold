-- 0003_multi_tenant_local_first.sql
-- Multi-Tenant Local-First schema extension for Cloudflare D1

-- 1. Tenants enhancements
ALTER TABLE tenants ADD COLUMN slug TEXT;
ALTER TABLE tenants ADD COLUMN updated_at INTEGER;

-- 2. Branches
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(tenant_id, code)
);

-- 3. Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 4. Tenant Memberships
CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('owner', 'manager', 'counter_staff', 'operator', 'finance')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(tenant_id, user_id)
);

-- 5. Customers enhancements
ALTER TABLE customers ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE customers ADD COLUMN branch_id TEXT REFERENCES branches(id);
ALTER TABLE customers ADD COLUMN email TEXT;
ALTER TABLE customers ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE customers ADD COLUMN deleted_at INTEGER;

-- 6. Services
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  pricing_unit TEXT NOT NULL CHECK(pricing_unit IN ('piece', 'kg', 'item', 'flat')),
  unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor >= 0),
  is_active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- 7. Orders enhancements
ALTER TABLE orders ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE orders ADD COLUMN branch_id TEXT REFERENCES branches(id);
ALTER TABLE orders ADD COLUMN order_number TEXT;
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'partially_paid', 'paid', 'refunded'));
ALTER TABLE orders ADD COLUMN subtotal_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN discount_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN tax_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN total_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN notes TEXT;
ALTER TABLE orders ADD COLUMN received_at INTEGER;
ALTER TABLE orders ADD COLUMN promised_at INTEGER;
ALTER TABLE orders ADD COLUMN delivered_at INTEGER;
ALTER TABLE orders ADD COLUMN deleted_at INTEGER;

-- 8. Order Items enhancements
ALTER TABLE order_items ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE order_items ADD COLUMN service_id TEXT REFERENCES services(id);
ALTER TABLE order_items ADD COLUMN unit_price_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN line_total_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN garment_attributes TEXT;
ALTER TABLE order_items ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE order_items ADD COLUMN updated_at INTEGER;
ALTER TABLE order_items ADD COLUMN deleted_at INTEGER;

-- 9. Payments (Append-only)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  method TEXT NOT NULL CHECK(method IN ('cash', 'UPI', 'card', 'bank transfer', 'other')),
  status TEXT NOT NULL CHECK(status IN ('pending', 'confirmed', 'failed', 'refunded')),
  provider_reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  recorded_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  created_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- 10. Device Registrations
CREATE TABLE IF NOT EXISTS device_registrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  branch_id TEXT REFERENCES branches(id),
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 11. Replication Policies
CREATE TABLE IF NOT EXISTS replication_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL,
  dataset TEXT NOT NULL,
  filter_rule TEXT NOT NULL,
  max_history_days INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id, role, dataset)
);

-- 12. Sync Operations
CREATE TABLE IF NOT EXISTS sync_operations (
  operation_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  device_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processed', 'rejected', 'conflict')),
  error_detail TEXT,
  processed_at INTEGER NOT NULL
);

-- 13. Sync Changes (Monotonically increasing sequence cursor)
CREATE TABLE IF NOT EXISTS sync_changes (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  branch_id TEXT,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  op TEXT NOT NULL CHECK(op IN ('insert', 'update', 'delete')),
  payload_json TEXT NOT NULL,
  changed_at INTEGER NOT NULL
);

-- Indexes for performance and tenant isolation
CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_branch ON customers (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_services_tenant ON services (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_branch ON orders (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON payments (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sync_changes_tenant_cursor ON sync_changes (tenant_id, cursor);
CREATE INDEX IF NOT EXISTS idx_sync_changes_branch_cursor ON sync_changes (tenant_id, branch_id, cursor);
CREATE INDEX IF NOT EXISTS idx_devices_tenant_user ON device_registrations (tenant_id, user_id);

