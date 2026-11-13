import { describe, it, expect, beforeEach } from 'vitest';
import { createTestD1Database } from '../helpers/d1-sqlite';
import {
  handleSyncPush,
  handleSyncPull,
  handleSyncStatus,
  handleSyncPolicy,
  handleRegisterDevice,
  handleSyncResolve,
} from '../../workers/laundry/src/sync/engine';
import type { InternalContext } from '../../packages/contracts/src/auth';
import type { SyncPushOperation } from '../../packages/contracts/src/sync';

describe('Phase 3: Cloudflare Worker & D1 Sync Endpoints', () => {
  let db: D1Database;

  const actorTenantA: InternalContext = {
    actorId: 'user-manager-1',
    actorType: 'user',
    role: 'manager',
    tenantId: 'tenant-fresh-1',
    hubId: 'branch-blr-1',
    exp: Date.now() + 60_000,
  };

  const actorTenantB: InternalContext = {
    actorId: 'user-manager-2',
    actorType: 'user',
    role: 'manager',
    tenantId: 'tenant-other-2',
    hubId: 'branch-del-2',
    exp: Date.now() + 60_000,
  };

  beforeEach(async () => {
    db = createTestD1Database();

    // Seed tenants, hubs, users, and branches
    await db
      .prepare('INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(actorTenantA.tenantId, 'FreshFold BLR', 'freshfold-blr', Date.now(), Date.now())
      .run();

    await db
      .prepare('INSERT INTO hubs (id, tenant_id, name, timezone, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(actorTenantA.hubId, actorTenantA.tenantId, 'Indiranagar Hub', 'Asia/Kolkata', Date.now())
      .run();

    await db
      .prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(actorTenantA.actorId, 'manager@freshfold.in', 'Manager One', Date.now(), Date.now())
      .run();

    await db
      .prepare('INSERT INTO branches (id, tenant_id, name, code, address, is_active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)')
      .bind(actorTenantA.hubId, actorTenantA.tenantId, 'Indiranagar', 'IND-1', '100ft Rd', Date.now(), Date.now())
      .run();

    await db
      .prepare('INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(actorTenantB.tenantId, 'Other Laundry', 'other-laundry', Date.now(), Date.now())
      .run();
  });

  describe('POST /api/sync/push', () => {
    it('atomically commits mutations, version updates, change logs, and idempotency receipts', async () => {
      const ops: SyncPushOperation[] = [
        {
          operationId: 'op-cust-1',
          deviceId: 'dev-1',
          entity: 'customer',
          entityId: 'cust-101',
          action: 'create',
          payload: {
            branchId: actorTenantA.hubId,
            name: 'Priya Patel',
            phone: '9876543210',
            email: 'priya@example.com',
          },
          baseVersion: 0,
          createdAt: Date.now(),
        },
        {
          operationId: 'op-order-1',
          deviceId: 'dev-1',
          entity: 'order',
          entityId: 'ord-101',
          action: 'create',
          payload: {
            branchId: actorTenantA.hubId,
            customerId: 'cust-101',
            orderNumber: 'ORD-202611-001',
            status: 'received',
            paymentStatus: 'unpaid',
            subtotalMinor: 15000,
            totalMinor: 15000,
          },
          baseVersion: 0,
          createdAt: Date.now(),
        },
      ];

      const response = await handleSyncPush(db, actorTenantA, ops);

      expect(response.acknowledged).toEqual(['op-cust-1', 'op-order-1']);
      expect(response.conflicts).toHaveLength(0);
      expect(response.errors).toHaveLength(0);

      // Verify records committed in D1
      const custRow = await db
        .prepare('SELECT * FROM customers WHERE id = ?')
        .bind('cust-101')
        .first<{ name: string; version: number }>();
      expect(custRow?.name).toBe('Priya Patel');
      expect(custRow?.version).toBe(1);

      const orderRow = await db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .bind('ord-101')
        .first<{ order_number: string; version: number }>();
      expect(orderRow?.order_number).toBe('ORD-202611-001');
      expect(orderRow?.version).toBe(1);

      // Verify sync_changes log entries
      const changes = await db
        .prepare('SELECT * FROM sync_changes WHERE tenant_id = ? ORDER BY cursor ASC')
        .bind(actorTenantA.tenantId)
        .all<{ cursor: number; entity: string; entity_id: string; version: number }>();
      expect(changes.results).toHaveLength(2);
      expect(changes.results[0].entity).toBe('customer');
      expect(changes.results[1].entity).toBe('order');

      // Verify idempotency receipt in sync_operations
      const syncOps = await db
        .prepare('SELECT * FROM sync_operations WHERE tenant_id = ?')
        .bind(actorTenantA.tenantId)
        .all<{ operation_id: string; status: string }>();
      expect(syncOps.results).toHaveLength(2);
      expect(syncOps.results.every((r) => r.status === 'processed')).toBe(true);
    });

    it('returns cached acknowledgement for duplicate requests without re-applying mutations', async () => {
      const ops: SyncPushOperation[] = [
        {
          operationId: 'op-idem-1',
          deviceId: 'dev-1',
          entity: 'service',
          entityId: 'srv-1',
          action: 'create',
          payload: {
            name: 'Dry Clean Silk',
            pricingUnit: 'piece',
            unitPriceMinor: 25000,
          },
          baseVersion: 0,
          createdAt: Date.now(),
        },
      ];

      // First push
      const firstRes = await handleSyncPush(db, actorTenantA, ops);
      expect(firstRes.acknowledged).toContain('op-idem-1');

      // Second push of exact same operation
      const secondRes = await handleSyncPush(db, actorTenantA, ops);
      expect(secondRes.acknowledged).toContain('op-idem-1');

      // Only 1 change log was appended
      const changes = await db
        .prepare('SELECT * FROM sync_changes WHERE entity_id = ?')
        .bind('srv-1')
        .all();
      expect(changes.results).toHaveLength(1);
    });

    it('detects version conflicts and returns current server record and version', async () => {
      // Seed existing customer and order with version 2
      await db
        .prepare(`INSERT INTO customers (id, hub_id, tenant_id, branch_id, name, phone, phone_normalized, version, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1000, 1000)`)
        .bind('cust-x', actorTenantA.hubId, actorTenantA.tenantId, actorTenantA.hubId, 'Cust X', '9999999999', '9999999999')
        .run();

      await db
        .prepare(`INSERT INTO orders (id, hub_id, tenant_id, branch_id, customer_id, order_number, status, service_type, last_mutation_id, version, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind('ord-conflict', actorTenantA.hubId, actorTenantA.tenantId, actorTenantA.hubId, 'cust-x', 'ORD-C1', 'washing', 'standard', 'mut-1', 2, 1000, 1000)
        .run();

      // Client attempts update with stale baseVersion: 1
      const conflictOp: SyncPushOperation = {
        operationId: 'op-stale-update',
        deviceId: 'dev-1',
        entity: 'order',
        entityId: 'ord-conflict',
        action: 'status_change',
        payload: { newStatus: 'drying' },
        baseVersion: 1, // Stale!
        createdAt: Date.now(),
      };

      const response = await handleSyncPush(db, actorTenantA, [conflictOp]);
      expect(response.acknowledged).toHaveLength(0);
      expect(response.conflicts).toHaveLength(1);

      const conflict = response.conflicts[0];
      expect(conflict.operationId).toBe('op-stale-update');
      expect(conflict.baseVersion).toBe(1);
      expect(conflict.serverVersion).toBe(2);
      expect(conflict.serverPayload.status).toBe('washing');
    });
  });

  describe('GET /api/sync/pull', () => {
    it('pulls monotonic sequence changes and handles incremental cursors', async () => {
      // Push 3 changes
      const ops: SyncPushOperation[] = [
        {
          operationId: 'op-p1',
          deviceId: 'dev-1',
          entity: 'branch',
          entityId: 'branch-kor-1',
          action: 'create',
          payload: { name: 'Koramangala', code: 'KOR-1', address: '80ft Rd' },
          baseVersion: 0,
          createdAt: 1000,
        },
        {
          operationId: 'op-p2',
          deviceId: 'dev-1',
          entity: 'service',
          entityId: 'srv-wf',
          action: 'create',
          payload: { name: 'Wash & Fold', pricingUnit: 'kg', unitPriceMinor: 8000 },
          baseVersion: 0,
          createdAt: 2000,
        },
      ];
      await handleSyncPush(db, actorTenantA, ops);

      // Initial pull from cursor 0
      const pull1 = await handleSyncPull(db, actorTenantA, { cursor: 0, limit: 100 });
      expect(pull1.changes).toHaveLength(2);
      expect(pull1.changes[0].entity).toBe('branch');
      expect(pull1.changes[1].entity).toBe('service');
      expect(pull1.hasMore).toBe(false);

      const nextCursor = pull1.nextCursor;

      // Incremental pull from nextCursor
      const pull2 = await handleSyncPull(db, actorTenantA, { cursor: nextCursor, limit: 100 });
      expect(pull2.changes).toHaveLength(0);
      expect(pull2.hasMore).toBe(false);
    });

    it('enforces multi-tenant data isolation on pull', async () => {
      // Push data for Tenant A
      await handleSyncPush(db, actorTenantA, [
        {
          operationId: 'op-a-only',
          deviceId: 'dev-a',
          entity: 'customer',
          entityId: 'cust-a-only',
          action: 'create',
          payload: { name: 'Tenant A Secret Customer', phone: '123' },
          baseVersion: 0,
          createdAt: Date.now(),
        },
      ]);

      // Tenant B pulls from cursor 0
      const pullB = await handleSyncPull(db, actorTenantB, { cursor: 0, limit: 100 });
      expect(pullB.changes).toHaveLength(0);

      const statusB = await handleSyncStatus(db, actorTenantB);
      expect(statusB.latestCursor).toBe(0);
    });
  });

  describe('Sync Status, Policy & Device Registration', () => {
    it('returns status with latest cursor and active devices', async () => {
      // Register device
      await handleRegisterDevice(db, actorTenantA, {
        deviceId: 'dev-ipad-1',
        deviceName: 'Front Desk iPad',
        platform: 'ios',
      });

      const status = await handleSyncStatus(db, actorTenantA);
      expect(status.status).toBe('ok');
      expect(status.tenantId).toBe(actorTenantA.tenantId);
      expect(status.activeDevices).toBe(1);
    });

    it('returns replication policy for role', async () => {
      const policy = await handleSyncPolicy(db, actorTenantA);
      expect(policy.tenantId).toBe(actorTenantA.tenantId);
      expect(policy.role).toBe('manager');
      expect(policy.policies.length).toBeGreaterThan(0);
    });

    it('resolves version conflict via handleSyncResolve', async () => {
      // Create initial customer and order
      await handleSyncPush(db, actorTenantA, [
        {
          operationId: 'op-res-cust',
          deviceId: 'dev-1',
          entity: 'customer',
          entityId: 'cust-res',
          action: 'create',
          payload: { name: 'Resolve Customer', phone: '8888888888' },
          baseVersion: 0,
          createdAt: Date.now(),
        },
        {
          operationId: 'op-res-1',
          deviceId: 'dev-1',
          entity: 'order',
          entityId: 'ord-res',
          action: 'create',
          payload: {
            customerId: 'cust-res',
            orderNumber: 'ORD-RES',
            notes: 'Initial note',
            serviceType: 'standard',
          },
          baseVersion: 0,
          createdAt: Date.now(),
        },
      ]);

      // Resolve conflict by updating note
      const resolveResult = await handleSyncResolve(db, actorTenantA, {
        conflictId: 'conf-1',
        entity: 'order',
        entityId: 'ord-res',
        resolution: 'custom',
        customPayload: { notes: 'Resolved conflict note' },
      });

      expect(resolveResult.resolved).toBe(true);
      expect(resolveResult.newVersion).toBe(2);

      const updated = await db
        .prepare('SELECT notes, version FROM orders WHERE id = ?')
        .bind('ord-res')
        .first<{ notes: string; version: number }>();
      expect(updated?.notes).toBe('Resolved conflict note');
      expect(updated?.version).toBe(2);
    });
  });
});
