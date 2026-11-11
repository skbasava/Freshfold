CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  supabase_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE employee_hub_memberships (
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  hub_id TEXT NOT NULL REFERENCES hubs(id),
  role TEXT NOT NULL CHECK (role IN ('front_desk', 'manager', 'service')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (employee_id, hub_id)
);

CREATE INDEX idx_employee_memberships_hub ON employee_hub_memberships(hub_id);
CREATE INDEX idx_employee_memberships_tenant_hub ON employee_hub_memberships(tenant_id, hub_id);
