CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE hubs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at INTEGER NOT NULL
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (hub_id, phone_normalized)
);

CREATE TABLE delivery_slots (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id),
  slot_key TEXT NOT NULL,
  local_date TEXT NOT NULL,
  local_start TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (hub_id, slot_key)
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL CHECK (status IN (
    'confirmed','processing','hold','out_for_delivery','delivered','cancelled',
    'received','inspection','washing','drying','ironing','quality_check','ready'
  )),
  service_type TEXT NOT NULL,
  delivery_slot_id TEXT REFERENCES delivery_slots(id),
  delivery_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  last_mutation_id TEXT NOT NULL,
  last_notified_delivery_at INTEGER,
  hold_comment TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  cancelled_at INTEGER
);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  service_type TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  mutation_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('app','calendar','system')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','service','system')),
  actor_id TEXT,
  previous_version INTEGER NOT NULL,
  new_version INTEGER NOT NULL,
  at INTEGER NOT NULL,
  detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
  UNIQUE (hub_id, mutation_id)
);

CREATE TABLE changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  changed_at INTEGER NOT NULL,
  UNIQUE (hub_id, order_id, version)
);

CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  destination TEXT NOT NULL CHECK (destination IN ('calendar','notification')),
  operation TEXT NOT NULL,
  target_version INTEGER NOT NULL,
  mutation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','dispatching','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_expires_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE (order_id, destination, operation, target_version)
);

CREATE TABLE calendar_sync (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  hub_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  etag TEXT,
  synced_version INTEGER NOT NULL,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending','synced','error','repairing')),
  last_error TEXT,
  last_projected_at INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE (calendar_id, event_id)
);

CREATE TABLE sync_state (
  calendar_id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL,
  sync_token TEXT,
  last_polled_at INTEGER,
  last_full_sync_at INTEGER,
  recovery_state TEXT NOT NULL DEFAULT 'idle',
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms')),
  destination TEXT NOT NULL,
  intended_at INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','sending','sent','failed','suppressed')),
  provider_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (idempotency_key)
);

CREATE TABLE calendar_repairs (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL,
  order_id TEXT,
  calendar_id TEXT NOT NULL,
  event_id TEXT,
  observed_etag TEXT,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
  created_at INTEGER NOT NULL
);
