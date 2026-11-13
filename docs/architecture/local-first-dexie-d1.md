# Local-First Multi-Tenant Architecture: React, Dexie.js & Cloudflare D1

## Overview

FreshFold Laundry Management System employs a **local-first, multi-tenant architecture** designed for high reliability, offline resilience, and fast UI responsiveness at laundry counters and processing hubs.

- **Local Read/Write Database:** Browser IndexedDB managed by **Dexie.js 4.x**.
- **Transactional Outbox:** Every local business mutation commits the entity and an outbox operation in the same IndexedDB transaction.
- **Authoritative Shared Database:** **Cloudflare D1** (SQLite) containing tenant-isolated records, sequence-based change logs, and idempotency receipts.
- **Real-Time Notification:** **Cloudflare Durable Objects** (`TenantRealtime`) with WebSocket Hibernation API for zero-latency cross-device notifications.
- **Multi-Tenant Scoping:** Strict tenant and branch scoping enforced across all database queries, migrations, and repositories.

---

## 1. Domain Entities & Invariants

### Entities
1. **Tenant**: Root SaaS organization boundary (`id`, `name`, `slug`, `createdAt`, `updatedAt`).
2. **Branch**: Operational hub / store (`id`, `tenantId`, `name`, `code`, `address`, `isActive`, `version`, timestamps).
3. **User & TenantMembership**: Staff users with explicit roles (`owner`, `manager`, `counter_staff`, `operator`, `finance`).
4. **Customer**: Branch-associated customer (`id`, `tenantId`, `branchId`, `name`, `phone`, `email`, `notes`, `version`, timestamps).
5. **Service**: Service catalogue (`id`, `tenantId`, `name`, `description`, `pricingUnit`, `unitPriceMinor`, `isActive`, `version`, timestamps).
   - Supported units: `piece`, `kg`, `item`, `flat`.
   - Prices stored as non-negative integer minor units (paise in INR).
6. **Order**: Multi-stage processing lifecycle:
   - Stages: `received` → `inspection` → `washing` → `drying` → `ironing` → `quality_check` → `ready` → `delivered` (or `cancelled`).
   - Payment status: `unpaid`, `partially_paid`, `paid`, `refunded`.
7. **OrderItem**: Individual garments or line items within an order (`quantity`, `unitPriceMinor`, `lineTotalMinor`, `garmentAttributes`).
8. **Payment**: Append-only payment ledger (`amountMinor`, `method`, `status`, `idempotencyKey`).
   - Invariant: Offline clients record payments with status `'pending'`. Offline records are **never** marked `'confirmed'` locally.
   - Reversals and refunds are recorded as append-only records rather than modifying historical entries.
9. **OutboxOperation**: Queued mutation (`operationId`, `tenantId`, `deviceId`, `entity`, `entityId`, `action`, `payload`, `baseVersion`, `status`, `retryCount`).
10. **SyncStateRecord**: Monotonically increasing sequence cursor per tenant and dataset (`dataset`, `lastCursor`, `status`).
11. **DeviceRegistration**: Device identification and revocation tracking (`isRevoked`, `lastSeenAt`).

---

## 2. Dexie.js Schema & Versioning

The client database is defined in `frontend/src/database/db.ts` and `frontend/src/database/schema.ts`.

### Schema Versions:
- **Version 1:** Legacy store definitions (`orders`, `mutations`, `meta`) for backward compatibility with early prototype data.
- **Version 2:** Comprehensive multi-tenant schema with `upgrade()` hook that migrates legacy data without destruction.

### Tables & Primary Indexes:
- `tenants`: `id, slug, createdAt`
- `branches`: `id, tenantId, [tenantId+isActive], code, updatedAt`
- `customers`: `id, tenantId, branchId, phone, [tenantId+branchId], updatedAt`
- `services`: `id, tenantId, [tenantId+isActive], updatedAt`
- `orders`: `id, tenantId, branchId, customerId, status, paymentStatus, orderNumber, [tenantId+status], [tenantId+branchId+status], updatedAt, receivedAt`
- `orderItems`: `id, tenantId, orderId, serviceId, updatedAt`
- `payments`: `id, tenantId, orderId, idempotencyKey, status, recordedAt`
- `outbox`: `operationId, tenantId, status, [tenantId+status], entity, entityId, createdAt`
- `syncState`: `id, tenantId, dataset, [tenantId+dataset]`
- `conflicts`: `id, tenantId, entity, entityId, resolved, createdAt`
- `devices`: `id, tenantId, userId, isRevoked`

---

## 3. Repositories & The Transactional Outbox Pattern

All application code interacts with the database through strongly-typed repositories located in `frontend/src/repositories/`. UI components must never access raw IndexedDB tables directly.

### Atomic Local Writes
Every local mutation (create, update, status change, soft delete, payment) executes inside an atomic Dexie transaction across the entity table and the `outbox` table:

```ts
await this.db.transaction('rw', [this.db.customers, this.db.outbox], async (tx) => {
  await this.db.customers.add(customer);
  await this.createOutboxOperation(
    'customer',
    customer.id,
    'create',
    customer,
    0,
    tx
  );
});
```

### Repositories Implemented:
1. `CustomerRepository`: Customer creation, updates, soft-deletion, search and tenant-filtered listing.
2. `BranchRepository`: Branch directory and metadata management.
3. `ServiceRepository`: Service catalogue and unit price enforcement.
4. `OrderRepository`: Multi-item atomic order creation, lifecycle state-machine enforcement, and payment status updates.
5. `OrderItemRepository`: Line-item management, quantity validation, and line total calculations.
6. `PaymentRepository`: Append-only payment transactions, refund records, and pending offline status guarantee.
7. `OutboxRepository`: Queue management, pending retrieval, in-flight marking, failure tracking, and safe server acknowledgement.
8. `SyncStateRepository`: Dataset cursor persistence and synchronization tracking.
9. `DeviceRepository`: Device registration, presence tracking, and revocation enforcement.

---

## 4. Cloudflare D1 Migration

The authoritative D1 schema is defined in `migrations/laundry/0003_multi_tenant_local_first.sql`.
It provisions:
- Core multi-tenant entities (`tenants`, `branches`, `users`, `tenant_memberships`, `customers`, `services`, `orders`, `order_items`, `payments`, `device_registrations`).
- Synchronization tables:
  - `sync_operations`: Server-side idempotency log and operation replay tracking.
  - `sync_changes`: Append-only change log with an autoincrementing `cursor` integer.
  - `replication_policies`: Server-controlled data scoping and historical retention rules.
- Tenant-scoped indexes on all foreign keys and query paths.

---

## 5. Phase 2: Transactional Outbox Lifecycle & Ordering

Phase 2 introduces the client-side push engine, dependency ordering, partial acknowledgements, exponential backoff, and network recovery:

### Components (`frontend/src/sync/`):
- `connectivity.ts`: Multi-environment network status listener (supporting browser online/offline events and testing mock injection).
- `retry.ts`: Exponential backoff with full decorrelated jitter to prevent thundering herd upon reconnection.
- `push.ts` (`OutboxPushEngine`):
  - `buildOrderedBatch()`: Enforces strict FIFO ordering while respecting entity dependencies (e.g. order creation must precede item/payment creation; subsequent mutations on an entity wait if an earlier mutation is blocked or in-flight).
  - `claimNextBatch()`: Bounded batch claiming (default 25 ops) transitioning status to `'in_flight'`.
  - `processBatchResponse()`: Safely handles partial batch responses:
    - **Acknowledged:** Cleanly removed from IndexedDB outbox. Newer local edits to the business entity are never overwritten.
    - **Conflicts:** Persisted to Dexie's `conflicts` table for user resolution, marked failed in outbox with preserved local intent.
    - **Errors:** Marked failed, retry counters incremented, last error stored.
    - **Unmentioned:** Safely reverted to `pending` so they are never lost.
  - `recoverStuckInFlight()`: Automatic recovery of operations left in-flight after crashes or tab closures.
- `scheduler.ts` (`OutboxScheduler`):
  - Coordinates automated flushing on reconnection or mutation.
  - Enforces a synchronization mutex preventing overlapping push executions.
  - Tracks observable state: `isSyncing`, `isOnline`, `pendingCount`, `failedCount`, `lastSyncAt`.

---

## 6. Phase 3: Cloudflare Worker API & Authoritative D1 Commit Engine

Phase 3 introduces the authoritative Cloudflare Worker endpoints and atomic D1 batch processing:

### Endpoints (`workers/laundry/src/sync/`):
- `POST /api/sync/push`:
  - Enforces authenticated staff actor, tenant isolation (`actor.tenantId`), and branch authorization.
  - Idempotency verification against `sync_operations` using SHA-256 payload hash.
  - Optimistic concurrency control: detects version conflicts against D1, returning current server version and payload without failing the rest of the batch.
  - Executes atomic D1 `db.batch()` committing:
    1. Business entity state (`customers`, `orders`, `order_items`, `services`, `branches`, `payments`).
    2. Version increment.
    3. Change log append to `sync_changes` with monotonic sequence cursor.
    4. Idempotency receipt to `sync_operations`.
  - Returns `{ acknowledged: string[], conflicts: SyncConflictItem[], errors: SyncErrorItem[] }`.
- `GET /api/sync/pull`:
  - Cursor-based incremental replication from `sync_changes`.
  - Strict tenant and branch filtering based on caller's role (`counter_staff` vs `manager` vs `owner`).
  - Returns `{ changes: SyncChangeItem[], nextCursor: number, hasMore: boolean }`.
- `GET /api/sync/status`:
  - Returns current tenant sync health, maximum server cursor, active registered devices count, and server time.
- `GET /api/sync/policy`:
  - Returns role-based replication policies (history days, allowed datasets, branch filters).
- `POST /api/sync/register-device`:
  - Registers or updates client hardware in `device_registrations`, recording last-seen timestamps and platform metadata.
- `POST /api/sync/resolve`:
  - Resolves version conflicts (`keep_local`, `accept_server`, `custom`) submitted by clients, committing updates and logging to `sync_changes`.

---

## 7. Sync Engine, Pull, Monotonic Cursors & Conflict Resolution (Phase 4)

The client-side `SyncEngine` (`frontend/src/sync/sync-engine.ts`) coordinates push, pull, scheduling, and conflict resolution under multi-tab Web Locks.

### Pull Pipeline
1. Reads the current sequence cursor for dataset(s) from `db.syncState`.
2. Calls `GET /api/sync/pull?cursor=...&limit=...`.
3. In a single atomic Dexie transaction:
   - Evaluates incoming changes against active outbox mutations.
   - **Local Draft Invariant**: If unpushed local edits exist for `entity:entityId` with lower `baseVersion`, the local draft is **never** blindly overwritten; a conflict record is logged in `db.conflicts` and `sync:conflict` event is emitted.
   - Applies authoritative remote updates/inserts.
   - Processes tombstones (soft deletion with `deletedAt` or physical deletion).
   - Advances `syncState.lastCursor` monotonically.
4. Loops while `hasMore === true`.

### Conflict Resolution
`ConflictResolver` (`frontend/src/sync/conflict-resolver.ts`) handles version collisions with three explicit strategies:
- **`accept_server`**: Discards local outbox op, overwrites local entity with server state, updates version.
- **`keep_local`**: Re-queues local mutation with `baseVersion = serverVersion` and pushes to server (or calls `POST /api/sync/resolve`).
- **`custom`**: Applies custom merged payload locally and enqueues outbox mutation with `baseVersion = serverVersion`.

### Multi-Tab Coordination
Using `createSyncLockCoordinator` (`frontend/src/sync/locks.ts`), browser tabs coordinate via the Web Locks API (`freshfold:sync:<tenantId>`). Only one tab pushes/pulls at a time, preventing race conditions.

---

## 8. Real-Time Durable Objects & WebSocket Hibernation (Phase 5)

Cloudflare Durable Objects provide scalable, cost-efficient real-time device communication:
- **Durable Object**: `TenantRealtime` (`workers/laundry/src/durable-objects/tenant-realtime.ts`).
- **WebSocket Hibernation API**: Uses `ctx.acceptWebSocket()`, `ctx.getWebSockets()`, and WebSocket attachment serialization to maintain thousands of idle client connections at near-zero compute cost.
- **Role**: Delivers instant **notifications**, never authoritative business state.
  - When mutations commit in D1, the worker dispatches `CHANGES_AVAILABLE` with `latestCursor`.
  - Connected frontends receive the notification and trigger `syncEngine.sync()` to pull authoritative records from D1.
  - Device revocation (`DEVICE_REVOKED`) forces clients to purge local IndexedDB storage.
- **Heartbeats**: Built-in ping/pong ensures active connection tracking and NAT keepalive.

---

## 9. UI Integration, Hooks & Operator Order Queue (Phase 6)

### Reactive Hooks
- **`useSync({ tenantId, syncEngine })`**: Reactively monitors outbox counts, conflict counts, and sync timestamps via Dexie `useLiveQuery` and `syncEvents`.
- **`useOrders({ tenantId, branchId, status, search })`**: Reactive live query for filtered orders from IndexedDB.
- **`useRealtime({ tenantId, branchId, syncEngine })`**: Manages WebSocket lifecycle, auto-reconnect with backoff, and heartbeat pinging.
- **`useOnlineStatus()`**: Reactive browser online/offline status.

### FreshFold UI Components
- **`SyncStatusBadge`**: Pill badge showing "Synced", "Syncing...", "Offline (X pending)", "Conflicts", or "Error", with a manual "Sync Now" action button.
- **`OperatorOrderQueue`**: Real-time counter and floor queue component allowing staff to advance garments across the lifecycle (`received` → `inspection` → `washing` → `drying` → `ironing` → `quality_check` → `ready` → `delivered`) with atomic local updates and outbox queuing.

---

## 10. Verification & Test Coverage

All 63 automated tests pass across 8 test suites:
- `tests/integration/tenant-realtime.test.ts` (6 tests)
- `tests/integration/sync-worker.test.ts` (8 tests)
- `frontend/src/database/__tests__/db.test.ts` (3 tests)
- `frontend/src/repositories/__tests__/repositories.test.ts` (15 tests)
- `frontend/src/sync/__tests__/outbox-lifecycle.test.ts` (9 tests)
- `frontend/src/sync/__tests__/sync-engine.test.ts` (10 tests)
- `frontend/src/ui/components/sync/__tests__/sync-ui.test.tsx` (5 tests)
- `frontend/src/ui/components/feedback/feedback.test.tsx` (7 tests)


