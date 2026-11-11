# Laundry ERP Architecture and Implementation Plan

**Status:** Approved Phase 1 plan on 2026-11-11.
**Approval record:** Phase 1 and the Stage A frontend scope were approved on 2026-11-11. Stage A added the `@freshfold/ui` package and a mock-backed Dashboard; it did not change backend business logic, final migrations, the authoritative write path, remote resources, or deployment status. Open decisions remain open unless separately recorded.
**Sources of truth:** `prompts/master-prompt.md` overrides `docs/laundry-calendar-sync.md`. Deviations are recorded in `docs/adr/`.
**Scope:** Phase 0 verification, Phase 1 architecture, and the approved Stage A frontend scaffold. Final migrations and the authoritative write path remain governed by their own approval gates.

---

## 1. System context

The Laundry ERP is a Cloudflare-native, offline-first order and delivery management system.

Primary actors:

- Front desk staff: create and update orders, work offline, view the delivery calendar read-only.
- Manager: all front-desk capabilities plus Calendar editing, specifically moving event start times.
- Service account: automated writer for canonical Google Calendar events.
- Calendar poller: detects manager edits, validates them, and reverts forbidden edits.
- Notification consumer: sends delayed WhatsApp/SMS messages after commit.

Authoritative state is D1. The browser holds a disposable IndexedDB replica and a pending mutation queue. Google Calendar is a projection, not a source of truth. Messaging is a post-commit side effect.

Out of scope for v1: payments, pricing engine, driver app, customer app, TV display, and a separate manager-owned calendar.

---

## 2. Phase 0 verification summary

| Area | Status | Notes |
|---|---|---|
| D1 `batch()` transaction semantics | Verified | Sequential, non-concurrent; failure aborts/rolls back the sequence. Zero-row `UPDATE` does not error. |
| D1 single-writer behaviour | Verified | Each database is single-threaded and serialises queries. |
| D1 triggers inside `batch()` | Unverified | No official page documents `RAISE(ABORT)` or rollback behaviour. Do not rely on triggers. |
| D1 `UPDATE ... RETURNING` | Unverified | Not documented for D1. Do not rely on it. |
| Queues at-least-once, retries, DLQ, delay, retention | Verified | Delay maximum 24 hours; retention up to 14 days. |
| Cron UTC behaviour | Verified | Cron expressions evaluate in UTC. |
| Service bindings | Verified | Internal Worker-to-Worker calls without public URLs. |
| WebCrypto RS256 | Verified | RSASSA-PKCS1-v1_5 is available for Google service-account JWT signing. |
| Vitest Workers integration | Verified | `@cloudflare/vitest-plugin` replaces the older pool package. |
| Google service-account OAuth | Verified | RS256 JWT assertion exchanged at the Google token endpoint. |
| Google incremental sync | Verified | `syncToken`; invalid token returns 410; next token only on the last page. |
| Google Calendar ownership | Verified deviation | Google warns against service-account data ownership. Use a real Workspace owner and grant the service account writer access. |
| Google conditional writes | Verified | `If-Match` with 412 on mismatch; 409 duplicate insert; 429 rate limit. |
| Google quotas | Verified | 10,000 requests/minute/project and 600/minute/user/project. |
| Workflows | Not selected | Queues plus Cron sweeper meet v1 requirements with less complexity. |
| Business rules | Open | Offline requirement, capacity, hours, cancellation, provider, tenancy, and notification delay require explicit confirmation. |

Official URLs and dates are recorded in the Phase 0 report presented before this plan. Unverified claims must be resolved by spike tasks before dependent implementation.

---

## 3. Physical Worker topology

```
Browser (IndexedDB)
   | HTTPS, secure session cookie
   v
Gateway Worker ---------------------> Auth Worker
   | service binding                    | AUTH_DB (separate D1)
   |
   | service binding
   v
Laundry Worker ---------------------> LAUNDRY_DB (sole D1)
   |
   +-- service binding --> Calendar Worker ------> Google Calendar API
   +-- service binding --> Notification Worker --> WhatsApp/SMS API
   +-- service binding --> Scheduler Worker
```

| Worker | Public | D1 | Bindings | Responsibilities |
|---|---|---|---|---|
| `gateway` | Yes | None | `AUTH`, `LAUNDRY`, `ASSETS` | Session validation, CSRF, rate limiting, validation, correlation ID, SPA serving, trusted context forwarding |
| `auth` | Internal | `AUTH_DB` | None | Login/logout, password verification, sessions, roles, hub membership, revocation |
| `laundry` | Internal | `LAUNDRY_DB` | `CALENDAR_QUEUE`, `NOTIFY_QUEUE` | Orders, customers, `applyChange()`, state machine, capacity, audit, change feed, outbox, Calendar metadata, notification ledger |
| `calendar` | Internal | None | `LAUNDRY`, `CALENDAR_QUEUE`, `CALENDAR_DLQ`, Google secrets | Outbox consumer, poller, classification, revert, reconciliation |
| `notifications` | Internal | None | `LAUNDRY`, `NOTIFY_QUEUE`, `NOTIFY_DLQ`, provider secrets | Delayed send, re-check, claim, provider call, outcome recording |
| `scheduler` | Internal | None | `LAUNDRY`, `CALENDAR`, `NOTIFICATIONS` | Outbox sweep, lease recovery, reconciliation trigger, health, DLQ alerts |

Rules:

- Only `laundry` holds `LAUNDRY_DB`.
- Gateway, Auth, Calendar, Notification, and Scheduler never access `LAUNDRY_DB`.
- Internal calls use service bindings, not public URLs.
- Service bindings do not propagate Cloudflare Access context; the system uses its own signed internal context.
- Deploy service-binding targets before callers.

### Queue topology

- `calendar-queue` with `calendar-dlq`.
- `notify-queue` with `notify-dlq`.
- At-least-once delivery; consumers are idempotent.
- `delaySeconds` maximum 24 hours; longer notification delays are re-enqueued by the sweeper.

### Cron schedule (UTC)

| Cron | Job |
|---|---|
| `* * * * *` | Calendar poller |
| `*/1 * * * *` | Outbox sweep and lease recovery |
| `0 18 * * *` | Nightly reconciliation (23:30 Asia/Kolkata) |
| `30 18 * * *` | Retention cleanup and health report |

All stored timestamps are UTC epoch milliseconds. Business-time logic uses `Asia/Kolkata`.

---

## 4. Authentication and security architecture

### Auth model

- Separate Auth Worker with `AUTH_DB`.
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, host-only.
- Session rotation on login and privilege change.
- CSRF double-submit token for state-changing requests.
- Password hashing with PBKDF2-HMAC-SHA256 via WebCrypto, per-user salt, high iteration count. If Cloudflare Access or an OIDC provider is available, it may replace local passwords via ADR.
- Rate limiting per IP and per account on login and mutations.

### Trusted context propagation

Gateway authenticates the session, then sends a signed internal context to Laundry:

```ts
type InternalContext = {
  actorId: string;
  actorType: "user" | "service" | "system";
  role: "front_desk" | "manager" | "service";
  tenantId: string;
  hubId: string;
  exp: number;
  nonce: string;
};
```

The context is HMAC-SHA256 signed with a secret held only by Gateway and Laundry. Laundry verifies signature, expiry, nonce/replay window, role, and hub membership. Client-supplied identity fields are ignored.

Calendar, Notification, and Scheduler Workers use service-binding identity plus a service token secret. They never accept user cookies.

### RBAC matrix

| Capability | Front desk | Manager |
|---|---|---|
| View orders | Yes | Yes |
| Create order | Yes | Yes |
| Reschedule | Configurable | Yes |
| Mark processing/out for delivery/delivered | Yes | Yes |
| Place/release hold | Yes | Yes |
| Cancel | Configurable | Configurable |
| View calendar | Read-only | Read/write |
| Manage users | No | Yes |
| Replay DLQ | No | Admin tool |
| View audit | Limited | Yes |

### Security controls

- Zod validation at every boundary.
- Bound SQL parameters only; no user-controlled identifiers.
- Tenant/hub filters on every query.
- PII minimisation; never log phone numbers, message bodies, keys, or tokens.
- Structured logs with correlation ID and mutation ID.
- Secure error responses without stack traces.
- Secrets in Cloudflare Secrets; `.dev.vars.example` contains placeholders only.
- Separate staging and production D1, Queues, Cron, Calendar, and messaging credentials.
- Google private key never in source or browser.
- Service secrets rotated with overlap.

---

## 5. Atomic `applyChange()` strategy

### Decision

Use a fail-closed guarded-statement batch. Rely only on verified D1 behaviour:

- `batch()` executes statements sequentially.
- A zero-row `UPDATE` is not an error.
- Every dependent write is guarded by `version = newVersion AND last_mutation_id = mutationId`.
- `D1Result.meta.changes` identifies whether the canonical write succeeded.

Do not depend on triggers or `RETURNING` for v1. Spike them in T-020; adopt only after a D1 integration test proves behaviour.

### Input contract

```ts
type ApplyChangeInput = {
  orderId: string;
  intent: "createOrder" | "reschedule" | "markProcessing" | "placeOnHold" | "releaseHold" | "markOutForDelivery" | "markDelivered" | "cancel";
  payload: unknown;
  baseVersion: number | null;
  mutationId: string;
};
```

`source`, `actor`, and `hubId` come from the trusted internal context.

### Update path

All statements execute in one `db.batch()`.

```sql
UPDATE orders
SET delivery_slot_id = ?,
    delivery_at = ?,
    status = ?,
    last_mutation_id = ?,
    version = version + 1,
    updated_at = ?
WHERE id = ?
  AND hub_id = ?
  AND version = ?
  AND NOT EXISTS (
    SELECT 1 FROM order_events
    WHERE hub_id = ? AND mutation_id = ?
  )
  AND (
    SELECT COUNT(*) FROM orders o
    WHERE o.hub_id = ?
      AND o.delivery_slot_id = ?
      AND o.status IN ('confirmed','processing','hold','out_for_delivery')
      AND o.id <> ?
  ) < (
    SELECT capacity FROM delivery_slots
    WHERE hub_id = ? AND id = ? AND active = 1
  );

INSERT OR IGNORE INTO order_events (
  id, hub_id, order_id, mutation_id, payload_hash, event_type,
  source, actor_type, actor_id, previous_version, new_version, at, detail_json
)
SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, ?, version, ?, ?
FROM orders
WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?
  AND NOT EXISTS (
    SELECT 1 FROM order_events WHERE hub_id = ? AND mutation_id = ?
  );

INSERT OR IGNORE INTO changes (hub_id, order_id, version, op, changed_at)
SELECT hub_id, id, version, 'upsert', ?
FROM orders
WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?;

INSERT OR IGNORE INTO outbox (
  id, hub_id, order_id, destination, operation, target_version,
  mutation_id, status, attempts, next_attempt_at, created_at
)
SELECT ?, hub_id, id, 'calendar', 'UPSERT_EVENT', version, ?, 'pending', 0, ?, ?
FROM orders
WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?;

INSERT OR IGNORE INTO outbox (
  id, hub_id, order_id, destination, operation, target_version,
  mutation_id, status, attempts, next_attempt_at, created_at
)
SELECT ?, hub_id, id, 'notification', 'SEND_STATUS', version, ?, 'pending', 0, ?, ?
FROM orders
WHERE id = ? AND hub_id = ? AND version = ? AND last_mutation_id = ?;
```

### Create path

```sql
INSERT OR IGNORE INTO orders (
  id, hub_id, customer_id, status, service_type,
  delivery_slot_id, delivery_at, version, last_mutation_id,
  last_notified_delivery_at, created_at, updated_at
)
SELECT ?, ?, ?, 'confirmed', ?, ?, ?, 1, ?, NULL, ?, ?
WHERE (
  SELECT COUNT(*) FROM orders
  WHERE hub_id = ? AND delivery_slot_id = ?
    AND status IN ('confirmed','processing','hold','out_for_delivery')
) < (
  SELECT capacity FROM delivery_slots
  WHERE hub_id = ? AND id = ? AND active = 1
);

INSERT OR IGNORE INTO order_events (...)
SELECT ...
FROM orders
WHERE id = ? AND hub_id = ? AND version = 1 AND last_mutation_id = ?;

INSERT OR IGNORE INTO changes (...)
SELECT ...
FROM orders
WHERE id = ? AND hub_id = ? AND version = 1 AND last_mutation_id = ?;

INSERT OR IGNORE INTO outbox (...)
SELECT ...
FROM orders
WHERE id = ? AND hub_id = ? AND version = 1 AND last_mutation_id = ?;
```

### Post-batch classification

| Result | Meaning | Response |
|---|---|---|
| `meta.changes = 1` | Committed | Return canonical order at new version |
| `0`, mutation exists with matching payload hash | Replay | Return stored result |
| `0`, mutation exists with different hash | Payload mismatch | `409 MUTATION_PAYLOAD_MISMATCH` |
| `0`, current version differs from `baseVersion` | Stale write | `409 VERSION_CONFLICT` with current order |
| `0`, slot at capacity | Capacity full | `422 SLOT_FULL` |
| `0`, invalid transition/validation | Business rejection | `422` with reason |

### Why it is fail-closed

The canonical `UPDATE` is the only statement that can create the new version and `last_mutation_id`. Every dependent insert selects from `orders` with both values. If the canonical statement affects zero rows, every dependent insert selects zero rows. No orphan audit, change-feed, outbox, or capacity rows are possible.

Dependent inserts use `INSERT OR IGNORE` with unique constraints on `order_events (hub_id, mutation_id)`, `changes (hub_id, order_id, version)`, and `outbox (order_id, destination, operation, target_version)`. This makes replay idempotent even when the order already has the new version. The T-020 spike proved this behaviour in the Workers Vitest D1 environment; see ADR-003.

Payload hashes use SHA-256 over canonical JSON: object keys are sorted recursively, arrays preserve order, and non-JSON values are rejected. Reordering payload keys therefore cannot change the hash. A replay with the same `mutationId` and canonical payload returns the stored result; a different canonical payload returns `409 MUTATION_PAYLOAD_MISMATCH`.

### Concurrency

D1 serialises statements per database. Two concurrent final-slot requests cannot both pass the capacity subquery and `UPDATE` because the second observes the first committed row. The capacity check is in the same statement as the write.

### Required spike

T-020 must prove in the Workers Vitest D1 environment:

1. Zero-row `UPDATE` plus guarded inserts writes zero dependent rows.
2. Two concurrent requests for the final slot: exactly one succeeds; count never exceeds capacity.
3. Replay with the same mutation ID writes nothing and returns the stored result.
4. Same mutation ID with a different payload is rejected.
5. `INSERT ... SELECT ... ON CONFLICT DO NOTHING` behaves as expected.
6. Trigger and `RETURNING` alternatives are tested before adoption.

---

## 6. D1 schema proposal

This is a proposal, not a final migration. All timestamps are UTC epoch milliseconds. IDs are text UUID/ULID. JSON columns use `json_valid`.

### Tenancy

```sql
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
```

### Customers and slots

```sql
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
```

No separate `delivery_reservations` table in v1. `orders.delivery_slot_id` is the single reservation record. Capacity is counted from active orders inside the guarded statement. This avoids dual-write inconsistency.

### Orders and items

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL REFERENCES hubs(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL CHECK (status IN (
    'confirmed','processing','hold','out_for_delivery','delivered','cancelled'
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
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  service_type TEXT,
  created_at INTEGER NOT NULL
);
```

### Audit, feed, outbox

```sql
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
```

### Calendar and notification state

```sql
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
```

### Indexes

```sql
CREATE INDEX idx_orders_hub_delivery ON orders(hub_id, delivery_at);
CREATE INDEX idx_orders_hub_slot_status ON orders(hub_id, delivery_slot_id, status);
CREATE INDEX idx_orders_hub_version ON orders(hub_id, id, version);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_slots_hub_key ON delivery_slots(hub_id, slot_key);
CREATE INDEX idx_order_events_order ON order_events(order_id, at);
CREATE INDEX idx_order_events_hub_mutation ON order_events(hub_id, mutation_id);
CREATE INDEX idx_changes_hub_cursor ON changes(hub_id, id);
CREATE INDEX idx_outbox_claim ON outbox(status, next_attempt_at);
CREATE INDEX idx_outbox_order ON outbox(order_id);
CREATE INDEX idx_calendar_sync_calendar ON calendar_sync(calendar_id, sync_status);
CREATE INDEX idx_notifications_claim ON notifications(state, intended_at);
CREATE INDEX idx_notifications_order ON notifications(order_id, created_at);
CREATE INDEX idx_repairs_order ON calendar_repairs(order_id, created_at);
```

### Retention proposal

| Table | Retention |
|---|---|
| `changes` | 90 days; clients fall back to snapshot |
| `order_events` | 2 years |
| `outbox` completed/failed | 90 days |
| `notifications` | 1 year |
| `calendar_repairs` | 90 days |
| `sync_state` | Current only |
| `orders` and `customers` | Business retention; soft delete preferred |

### Open schema decisions

- `OPEN-002`: single-tenant or multi-tenant; whether `tenant_id` is explicit on every row.
- `OPEN-003`: slot sizes, capacities, business hours, and which statuses consume capacity.
- `OPEN-009`: whether items can change after creation and whether that is a new intent.
- `OPEN-010`: whether customer creation is allowed offline.

---

## 7. Offline IndexedDB sync design

### Database

`laundry-frontdesk` version 1.

| Store | Key | Indexes | Purpose |
|---|---|---|---|
| `orders` | `id` | `by_delivery_at`, `by_status`, `by_sync_state` | Cached canonical and optimistic orders |
| `mutations` | `mutationId` | `by_order_id`, `by_status`, `by_created_at` | Pending, rejected, and conflict queue |
| `meta` | key | None | `cursor`, `lastSyncedAt`, `hubId`, `schemaVersion` |
| `customers` | `id` | `by_phone` | Optional read cache if offline customer selection is approved |

### Offline create/update

1. Validate locally with shared Zod schemas.
2. Generate `mutationId` and, for create, a ULID order ID.
3. In one IndexedDB transaction covering `orders` and `mutations`:
   - Write optimistic order with `sync_state = 'pending'`.
   - Write mutation with `baseVersion` and `status = 'pending'`.
4. Show provisional state; never show server-confirmed.

### Sync states

| Status | Meaning | Action |
|---|---|---|
| `pending` | Not acknowledged | Submit when online |
| `sending` | In flight | Retry with same `mutationId` |
| `synced` | Accepted | Replace with canonical order |
| `rejected` | Business rejection | Keep and show reason |
| `conflict` | Version conflict | Keep and show server order |
| `paused` | Auth failure | Stop queue and prompt login |

### Response handling

| Response | Behaviour |
|---|---|
| 2xx canonical order | Replace local row, clear pending, advance cursor |
| 409 version conflict | Keep mutation, show conflict |
| 409 payload mismatch | Mark rejected, no automatic retry |
| 422 | Mark rejected with reason |
| 401/403 | Pause queue and re-authenticate |
| 429/5xx/network | Retry with exponential backoff and jitter |

### Change feed

- Pull every 30–60 seconds while active, on tab focus, after an accepted write, and after reconnect.
- Request `GET /changes?since=<cursor>`; cursor is `changes.id`.
- Apply pages in ascending order; advance cursor only after the page is applied.
- Upserts replace local rows. If a local pending mutation exists, mark conflict but keep the optimistic row visible.
- `delete` removes local rows.
- If the cursor is too old or the server returns `resetRequired`, fetch a snapshot and rebuild.
- Current v1 endpoint returns `nextCursor` and `hasMore`; retention and `resetRequired` handling remain pending future work.

### Multi-tab safety

- Web Locks per order for mutation submission.
- Web Lock leader election for change-feed polling.
- BroadcastChannel `laundry-sync` for accepted writes, conflicts, and cursor advances.
- IndexedDB transactions are the only local consistency mechanism.

### Recovery

- Request `navigator.storage.persist()`.
- Show unsynced mutation count and age.
- Warn before tab close with pending mutations.
- On eviction or clear, rebuild from snapshot and explain that unsent mutations may be irrecoverable.
- Never claim an offline order is server-confirmed.

---

## 8. Calendar integration

### Ownership

`ADR-004`: a real Workspace user owns the calendar. The service account is granted `writer` via ACL. Front desk gets `reader`; manager gets `writer` or `owner` as business requires. The service account is not the data owner.

### Event projection

- Deterministic event ID derived from order ID using base32hex-safe characters.
- Title: `Deliver 5 PM · C-238 Rahul · ORD-1042`.
- Timed event in `Asia/Kolkata`; all-day only when the business promises a date only.
- Description: service and item counts, opaque app link; no phone, address, or sensitive detail.
- `extendedProperties.private`: `orderId`, `projectedVersion`.
- Optional `colorId`.

### Poll cycle

1. Read `sync_state.sync_token`.
2. List events with `syncToken`, `showDeleted=true`, `maxResults=2500`.
3. Paginate with `pageToken`; process every page.
4. Match `extendedProperties.private.orderId` in code.
5. Compare event `etag` with `calendar_sync.etag`.
6. Skip if equal or semantically equal to the canonical projection.
7. Classify changed events.

### Classification

| Observation | Action |
|---|---|
| Unknown `orderId` | Leave event; record warning; never delete |
| Deleted/cancelled | Restore if order is active; record repair |
| Start time changed, duration unchanged | Valid reschedule if timed, future, business hours, allowed status, capacity available; call `applyChange` with `baseVersion = projectedVersion` |
| Start plus other fields changed | Revert; no `applyChange` |
| End time changed (resize) | Revert; start move only |
| Title, description, color, recurrence changed | Revert |
| All-day event | Revert |
| Past event or disallowed status | Revert |
| Capacity full | Reject and revert with reason |
| Stale projected version | `applyChange` returns 409; revert and record |

### Revert

1. Read canonical order and build canonical event.
2. Get current event and etag.
3. Update with `If-Match`.
4. On 412, re-fetch and re-evaluate.
5. On deleted event, insert with the same deterministic ID.
6. Persist new etag and `synced_version`.
7. Record `calendar_repairs`.
8. Never call `applyChange` for a rejected or forbidden edit.

### Sync token recovery

- On 410: clear token, set `recovery_state = 'full_sync'`, full list with deleted events, reconcile, then persist the new token after all pages.
- On 429/5xx: backoff; do not advance token; alert after threshold.
- Never persist a next token from a non-final page.

### Nightly reconciliation

- Ingest outstanding manager edits first.
- Compare canonical orders with events.
- Repair only when no unprocessed manager edit is pending.
- Record unresolved conflicts and alert.
- Never bulk-overwrite.

---

## 9. Outbox, Queues, Cron, and DLQ

### Outbox lifecycle

1. `applyChange()` inserts outbox rows in the batch.
2. After commit, `ctx.waitUntil()` sends messages as best effort.
3. Scheduler sweeper claims eligible rows and sends messages.
4. Consumers mark rows done or failed.
5. Expired leases are reclaimed.

### Claiming

```sql
UPDATE outbox
SET status = 'dispatching',
    lease_token = ?,
    lease_expires_at = ?,
    attempts = attempts + 1
WHERE id IN (
  SELECT id FROM outbox
  WHERE status IN ('pending','dispatching')
    AND next_attempt_at <= ?
    AND (lease_expires_at IS NULL OR lease_expires_at < ?)
  ORDER BY next_attempt_at
  LIMIT ?
);
```

Then select claimed rows by `lease_token`. D1 serialises the update, so two sweepers cannot claim the same row.

### Message contract

```json
{
  "outboxId": "string",
  "hubId": "string",
  "orderId": "string",
  "destination": "calendar",
  "operation": "UPSERT_EVENT",
  "targetVersion": 7,
  "mutationId": "string"
}
```

Consumers reload authoritative state and are idempotent.

### Calendar consumer

1. Load outbox and canonical order.
2. Skip if `synced_version >= targetVersion`.
3. Create or patch the deterministic event.
4. On insert 409, patch the existing event.
5. Store etag and `synced_version`; mark done.
6. Retry 429/5xx with backoff; DLQ terminal failures.
7. On 410, trigger full resync.

### Notification consumer

1. Wait until `intended_at`; delay maximum 24 hours, re-enqueue longer delays.
2. Reload order and re-check relevance.
3. Drop if the change is superseded or `delivery_at == last_notified_delivery_at`.
4. Atomically claim the notification.
5. Call provider with idempotency key if supported.
6. Record provider message ID and state.
7. On ambiguous timeout, retry per provider policy; exactly-once is not guaranteed without provider idempotency.
8. Mark sent, failed, or suppressed.

### DLQ

- `calendar-dlq` and `notify-dlq`.
- Alert when depth > 0.
- Internal admin inspection.
- Controlled replay with the same idempotency keys.
- Poison messages isolated by attempts and error class.
- No infinite automatic replay.

---

## 10. Observability

Metrics and alerts:

- Pending outbox count and age.
- Queue retry count.
- Calendar DLQ depth.
- Notification DLQ depth.
- Sync-token resets.
- Calendar reverts per day.
- Reconciliation drift.
- Notification failures.
- Mutation conflicts.
- Offline pending mutations.
- Capacity rejections.

Structured logs include correlation ID, hub ID, order ID, mutation ID, and outcome. Never log keys, tokens, phone numbers, or message contents.

Runbooks:

- Google outage.
- Messaging outage.
- D1 errors and quota.
- Queue backlog.
- Invalid sync token.
- DLQ replay.
- Incorrect projection.
- Notification uncertainty.
- Secret rotation.
- Staging to production.

---

## 11. Environment separation and deployment

| Environment | Resources |
|---|---|
| Local | Miniflare/Workers Vitest, local D1, fake Google and messaging providers |
| Staging | Dedicated D1, Queues, Cron, Calendar, and messaging credentials |
| Production | Dedicated resources; explicit deploy approval |

Rules:

- Staging must not share production D1, Queues, Calendar, or messaging credentials.
- `.dev.vars.example` contains placeholders only.
- Migrations are versioned and reviewed.
- Deploy service-binding targets before callers.
- Rollback plan includes Worker version rollback and D1 Time Travel restore.
- No production deploy without explicit approval.

---

## 12. Testing strategy

| Layer | Coverage |
|---|---|
| Unit | State machine, validation, business hours, capacity, idempotency, conflicts, Calendar classification, notification suppression, event ID generation, retry classification |
| D1 integration | Atomic mutation, zero-row update, concurrent conflict, concurrent final slot, audit/outbox consistency, replay, outbox claiming, expired leases, change-feed ordering, tenant isolation |
| Queue | Duplicate, out-of-order, consumer crash, retry exhaustion, DLQ, safe replay, enqueue failure after commit |
| Calendar | Create/update, manager reschedule, forbidden title/resize, deletion/restoration, echo suppression, concurrent edits, stale version, 429/5xx, 410, pagination, reconciliation |
| Offline frontend | Offline create/update, reload, multiple pending, conflicting remote, 409/422, eviction, snapshot recovery, multi-tab, network interruption |
| E2E | Ten master-prompt scenarios, including final-slot contention and reconciliation without overwriting pending manager edits |

Deterministic clocks and fake providers are mandatory. Real integration tests run only with staging credentials.

---

## 13. Threat model

| Threat | Control |
|---|---|
| Spoofed actor/role/hub | Trusted signed context from Gateway; Auth session verification |
| CSRF | Double-submit token; SameSite cookie |
| Replay of mutations | `mutationId` uniqueness and payload hash |
| Cross-tenant access | Hub-scoped queries and authorization tests |
| Calendar edit spoofing | Calendar source is system-attributed; no manager identity claim without Google attribution |
| Secret leakage | Cloudflare Secrets; redaction; no secrets in source or logs |
| PII exposure | Minimal Calendar description; no phone/address in logs or events |
| SQL injection | Bound parameters; no identifier interpolation |
| Queue duplicate | Idempotent consumers and deterministic event IDs |
| Lost post-commit work | Transactional outbox and cron sweeper |

---

## 14. Performance and quota assumptions

- D1 is single-threaded per database; writes serialise. Keep transactions short and batch statements.
- Calendar poll every minute is acceptable only if order volume and quota allow. Quota limits are 10,000/minute/project and 600/minute/user/project; the service account counts as one user.
- Workers CPU: default 30 seconds for HTTP; 30 seconds for Cron intervals under one hour; 15 minutes for longer intervals.
- Queue delays are capped at 24 hours; longer delays require re-enqueue.
- D1 query limits: 100 bound parameters per query, 100 KB SQL, 30-second query duration.
- Subrequests: 10,000 per paid invocation; 6 simultaneous outgoing connections.
- If volume exceeds these assumptions, reassess polling cadence, queue batching, and potentially Workflows.

---

## 15. ADR register

| ADR | Decision |
|---|---|
| ADR-001 | Master prompt overrides the architecture document. |
| ADR-002 | No Workers KV. |
| ADR-003 | Fail-closed guarded batch; triggers and `RETURNING` deferred. |
| ADR-004 | Real Workspace user owns the Calendar; service account gets writer ACL. |
| ADR-005 | Polling over webhooks for v1. |
| ADR-006 | Separate Auth Worker with `AUTH_DB`. |
| ADR-007 | Queue topology and DLQ. |
| ADR-008 | UTC storage and Asia/Kolkata business time. |
| ADR-009 | Workflows not selected for v1. |
| ADR-010 | Offline requirement pending business confirmation. |
| ADR-011 | Capacity counted from active orders; no separate reservation table. |
| ADR-012 | Notification provider and idempotency pending. |

ADR files are created in `docs/adr/` during Phase 1 review.

---

## 16. Open decisions

| ID | Decision needed | Default proposed | Impact |
|---|---|---|---|
| OPEN-001 | Is offline order creation/editing required? | Yes, per architecture doc | Scope, IndexedDB, conflict UI |
| OPEN-002 | Single hub or multi-tenant? | Multi-tenant-ready, hub-scoped | Schema, auth, queries |
| OPEN-003 | Slot sizes, capacity, business hours, capacity statuses | Implemented for v1: 2-hour slots, configurable capacity, 09:00–20:00 Asia/Kolkata | Schema, validation, capacity SQL |
| OPEN-004 | Who may cancel and refund? | Manager only; no refunds in v1 | RBAC, state machine |
| OPEN-005 | Calendar ownership | Real Workspace owner; service account writer | Google setup, ADR |
| OPEN-006 | Auth provider | Separate Auth Worker with `AUTH_DB` | Auth, deployment |
| OPEN-007 | WhatsApp, SMS, or both; provider; delay | Both channels configurable; few-minute delay | Notification schema, provider integration |
| OPEN-008 | Offline customer creation? | Existing cached customers only | IndexedDB stores, UX |
| OPEN-009 | Can order items change after creation? | No in v1 except via cancel/recreate | Intents, schema |
| OPEN-010 | Is one-minute polling acceptable? | Yes for v1; revisit with volume | Quota, latency, webhooks |

No open decision may be silently resolved in implementation. Each requires explicit confirmation and, where architectural, an ADR.

---

## 17. Approval gate

Phase 1 is complete when:

- This plan, the constitution, and the task list are reviewed.
- Open decisions are answered or explicitly deferred.
- The D1 transaction strategy is approved for spike.
- The D1 schema proposal is approved for migration authoring.
- The authoritative write path is approved for implementation.

Phase 2 implementation begins only after explicit approval. Production deploy requires a separate explicit approval.
