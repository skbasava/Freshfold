import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LaundryDatabase, createDatabase } from '../../database/db';
import {
  CustomerRepository,
  OrderRepository,
  PaymentRepository,
} from '../../repositories';
import { SyncEngine } from '../sync-engine';
import { PullEngine } from '../pull';
import { ConflictResolver } from '../conflict-resolver';
import { connectivity } from '../connectivity';
import { syncEvents } from '../sync-events';
import { createInMemoryLockManager } from '../locks';
import type {
  SyncPullResponse,
  SyncPushResponse,
  SyncChangeItem,
} from '../../../../packages/contracts/src/sync';

describe('Phase 4: Sync Engine, Pull, Selective Replication & Conflict Resolution', () => {
  let db: LaundryDatabase;
  const tenantId = 'tenant-test-p4';
  const deviceId = 'device-tablet-p4';
  const branchId = 'branch-main';

  beforeEach(async () => {
    connectivity.setMockOnline(true);
    db = createDatabase(`sync-engine-test-${crypto.randomUUID()}`);
    await db.open();
    syncEvents.removeAllListeners();
  });

  afterEach(async () => {
    if (db && db.isOpen()) {
      await db.delete();
    }
    syncEvents.removeAllListeners();
  });

  describe('PullEngine', () => {
    it('applies remote changes and advances sequence cursor in a single atomic transaction', async () => {
      const pullEngine = new PullEngine(db, tenantId);

      const remoteChanges: SyncChangeItem[] = [
        {
          cursor: 101,
          entity: 'customer',
          entityId: 'cust-remote-1',
          branchId: 'branch-main',
          version: 1,
          op: 'insert',
          payload: {
            name: 'Priya Sharma',
            phone: '9876543210',
            email: 'priya@example.com',
          },
          changedAt: Date.now(),
        },
        {
          cursor: 102,
          entity: 'service',
          entityId: 'srv-dryclean-1',
          branchId: null,
          version: 1,
          op: 'insert',
          payload: {
            name: 'Dry Cleaning',
            pricingUnit: 'piece',
            unitPriceMinor: 15000,
            isActive: true,
          },
          changedAt: Date.now(),
        },
      ];

      const mockPullTransport = vi.fn().mockResolvedValueOnce({
        changes: remoteChanges,
        nextCursor: 102,
        hasMore: false,
      } as SyncPullResponse);

      const result = await pullEngine.pullDataset('all', mockPullTransport);

      expect(result.changesApplied).toBe(2);
      expect(result.finalCursor).toBe(102);

      // Verify records are persisted in local Dexie tables
      const savedCustomer = await db.customers.get('cust-remote-1');
      expect(savedCustomer).toBeDefined();
      expect(savedCustomer?.name).toBe('Priya Sharma');
      expect(savedCustomer?.tenantId).toBe(tenantId);
      expect(savedCustomer?.version).toBe(1);

      const savedService = await db.services.get('srv-dryclean-1');
      expect(savedService).toBeDefined();
      expect(savedService?.name).toBe('Dry Cleaning');
      expect(savedService?.unitPriceMinor).toBe(15000);

      // Verify sync cursor state was persisted
      const cursor = await pullEngine.getCursor('all');
      expect(cursor).toBe(102);
    });

    it('processes remote tombstones (deletions) correctly', async () => {
      const customerRepo = new CustomerRepository(db, { tenantId, deviceId });
      const customer = await customerRepo.create({
        branchId: 'branch-main',
        name: 'To Be Deleted',
        phone: '1122334455',
      });

      // Clear outbox to simulate already pushed state
      await db.outbox.clear();

      const pullEngine = new PullEngine(db, tenantId);
      const deleteChange: SyncChangeItem = {
        cursor: 201,
        entity: 'customer',
        entityId: customer.id,
        branchId: 'branch-main',
        version: 2,
        op: 'delete',
        payload: { deletedAt: Date.now() },
        changedAt: Date.now(),
      };

      const mockPullTransport = vi.fn().mockResolvedValueOnce({
        changes: [deleteChange],
        nextCursor: 201,
        hasMore: false,
      } as SyncPullResponse);

      await pullEngine.pullDataset('all', mockPullTransport);

      // Verify record is marked deleted locally
      const updatedCustomer = await db.customers.get(customer.id);
      expect(updatedCustomer?.deletedAt).toBeDefined();
      expect(updatedCustomer?.version).toBe(2);
    });

    it('preserves unpushed local edits and flags conflicts instead of overwriting', async () => {
      const customerRepo = new CustomerRepository(db, { tenantId, deviceId });

      // Create a customer locally (produces a pending outbox operation)
      const localCustomer = await customerRepo.create({
        branchId: 'branch-main',
        name: 'Local Offline Draft',
        phone: '9988776655',
      });

      const pendingOps = await db.outbox.toArray();
      expect(pendingOps.length).toBe(1);

      const conflictListener = vi.fn();
      syncEvents.on('sync:conflict', conflictListener);

      // Remote sends a concurrent update with higher version
      const pullEngine = new PullEngine(db, tenantId);
      const remoteConflictingChange: SyncChangeItem = {
        cursor: 301,
        entity: 'customer',
        entityId: localCustomer.id,
        branchId: 'branch-main',
        version: 5,
        op: 'update',
        payload: {
          name: 'Remote Cloud Overwrite Attempt',
        },
        changedAt: Date.now(),
      };

      const mockPullTransport = vi.fn().mockResolvedValueOnce({
        changes: [remoteConflictingChange],
        nextCursor: 301,
        hasMore: false,
      } as SyncPullResponse);

      const result = await pullEngine.pullDataset('all', mockPullTransport);

      expect(result.conflictsDetected).toBe(1);
      expect(conflictListener).toHaveBeenCalled();

      // Invariant: Local draft was NOT overwritten
      const currentLocal = await db.customers.get(localCustomer.id);
      expect(currentLocal?.name).toBe('Local Offline Draft');

      // Conflict record was created in Dexie conflicts table
      const conflicts = await db.conflicts.toArray();
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].entityId).toBe(localCustomer.id);
      expect(conflicts[0].serverVersion).toBe(5);
      expect(conflicts[0].resolved).toBe(false);
    });
  });

  describe('ConflictResolver', () => {
    it('resolves conflict with "accept_server" by updating local entity and clearing outbox', async () => {
      const customerRepo = new CustomerRepository(db, { tenantId, deviceId });
      const localCust = await customerRepo.create({
        branchId: 'branch-main',
        name: 'Local Draft',
        phone: '1234567890',
      });

      const conflictRecord = {
        id: 'conflict-1',
        tenantId,
        entity: 'customer' as const,
        entityId: localCust.id,
        operationId: 'op-1',
        baseVersion: 1,
        serverVersion: 3,
        localPayload: { name: 'Local Draft' },
        serverPayload: { name: 'Server Authority Name' },
        resolved: false,
        resolvedAt: null,
        resolution: null,
        createdAt: Date.now(),
      };

      await db.conflicts.put(conflictRecord);

      const resolver = new ConflictResolver(db, tenantId);
      const success = await resolver.resolveConflict({
        conflictId: 'conflict-1',
        resolution: 'accept_server',
      });

      expect(success).toBe(true);

      // Local entity has accepted server values
      const updated = await db.customers.get(localCust.id);
      expect(updated?.name).toBe('Server Authority Name');
      expect(updated?.version).toBe(3);

      // Conflict marked resolved
      const conflict = await db.conflicts.get('conflict-1');
      expect(conflict?.resolved).toBe(true);
      expect(conflict?.resolution).toBe('accept_server');
    });

    it('resolves conflict with "keep_local" by bumping baseVersion for retry', async () => {
      const customerRepo = new CustomerRepository(db, { tenantId, deviceId });
      const localCust = await customerRepo.create({
        branchId: 'branch-main',
        name: 'Local Winner',
        phone: '1234567890',
      });

      const outboxOps = await db.outbox.toArray();
      const opId = outboxOps[0].operationId;

      await db.conflicts.put({
        id: 'conflict-2',
        tenantId,
        entity: 'customer',
        entityId: localCust.id,
        operationId: opId,
        baseVersion: 1,
        serverVersion: 4,
        localPayload: { name: 'Local Winner' },
        serverPayload: { name: 'Server Stale Value' },
        resolved: false,
        resolvedAt: null,
        resolution: null,
        createdAt: Date.now(),
      });

      const resolver = new ConflictResolver(db, tenantId);
      await resolver.resolveConflict({
        conflictId: 'conflict-2',
        resolution: 'keep_local',
      });

      // Outbox op has baseVersion bumped to serverVersion so it can push without conflict
      const updatedOp = await db.outbox.get(opId);
      expect(updatedOp?.baseVersion).toBe(4);
      expect(updatedOp?.status).toBe('pending');
    });

    it('resolves conflict with "custom" payload', async () => {
      const customerRepo = new CustomerRepository(db, { tenantId, deviceId });
      const localCust = await customerRepo.create({
        branchId: 'branch-main',
        name: 'Old Value',
        phone: '1234567890',
      });

      await db.conflicts.put({
        id: 'conflict-3',
        tenantId,
        entity: 'customer',
        entityId: localCust.id,
        operationId: 'op-3',
        baseVersion: 1,
        serverVersion: 2,
        localPayload: { name: 'Old Value' },
        serverPayload: { name: 'Server Value' },
        resolved: false,
        resolvedAt: null,
        resolution: null,
        createdAt: Date.now(),
      });

      const resolver = new ConflictResolver(db, tenantId);
      await resolver.resolveConflict({
        conflictId: 'conflict-3',
        resolution: 'custom',
        customPayload: { name: 'Merged Custom Name' },
      });

      const updated = await db.customers.get(localCust.id);
      expect(updated?.name).toBe('Merged Custom Name');
    });
  });

  describe('SyncEngine End-to-End Coordination', () => {
    it('executes push then pull round-trip under Web Lock', async () => {
      const orderRepo = new OrderRepository(db, { tenantId, deviceId });

      // Create an order locally
      const order = await orderRepo.create({
        branchId,
        customerId: 'cust-1',
        orderNumber: 'FF-2026-001',
        subtotalMinor: 50000,
        totalMinor: 50000,
      });

      const mockPushTransport = vi.fn().mockImplementation(async (ops) => {
        return {
          acknowledged: ops.map((o: any) => o.operationId),
          conflicts: [],
          errors: [],
        } as SyncPushResponse;
      });

      const mockPullTransport = vi.fn().mockResolvedValue({
        changes: [
          {
            cursor: 50,
            entity: 'order',
            entityId: order.id,
            branchId,
            version: 2,
            op: 'update',
            payload: {
              status: 'inspection',
              orderNumber: 'FF-2026-001',
            },
            changedAt: Date.now(),
          },
        ],
        nextCursor: 50,
        hasMore: false,
      } as SyncPullResponse);

      const lockManager = createInMemoryLockManager();

      const syncEngine = new SyncEngine({
        db,
        tenantId,
        deviceId,
        branchId,
        pushTransport: mockPushTransport,
        pullTransport: mockPullTransport,
        lockManager,
      });

      const syncResult = await syncEngine.sync();

      expect(syncResult.success).toBe(true);
      expect(syncResult.pushedOps).toBe(1);
      expect(syncResult.pulledChanges).toBe(1);

      // Outbox op deleted upon acknowledgement
      const remainingOutbox = await db.outbox.toArray();
      expect(remainingOutbox.length).toBe(0);

      // Order updated with remote change
      const savedOrder = await db.orders.get(order.id);
      expect(savedOrder?.status).toBe('inspection');
    });

    it('handles offline state safely without throwing', async () => {
      connectivity.setMockOnline(false);

      const mockPushTransport = vi.fn();
      const mockPullTransport = vi.fn();

      const syncEngine = new SyncEngine({
        db,
        tenantId,
        deviceId,
        pushTransport: mockPushTransport,
        pullTransport: mockPullTransport,
      });

      const result = await syncEngine.sync();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Offline');
      expect(mockPushTransport).not.toHaveBeenCalled();
      expect(mockPullTransport).not.toHaveBeenCalled();
    });

    it('prevents concurrent sync runs using lock manager', async () => {
      const lockManager = createInMemoryLockManager();

      let resolvePush: any;
      const blockingPushPromise = new Promise((resolve) => {
        resolvePush = resolve;
      });

      const mockPushTransport = vi.fn().mockImplementation(async () => {
        await blockingPushPromise;
        return { acknowledged: [], conflicts: [], errors: [] };
      });

      const mockPullTransport = vi.fn().mockResolvedValue({
        changes: [],
        nextCursor: 0,
        hasMore: false,
      });

      const syncEngine1 = new SyncEngine({
        db,
        tenantId,
        deviceId,
        pushTransport: mockPushTransport,
        pullTransport: mockPullTransport,
        lockManager,
      });

      const syncEngine2 = new SyncEngine({
        db,
        tenantId,
        deviceId,
        pushTransport: mockPushTransport,
        pullTransport: mockPullTransport,
        lockManager,
      });

      // Start sync on engine 1 (acquires lock and blocks in transport)
      const promise1 = syncEngine1.sync();

      // Trigger sync on engine 2 while engine 1 is holding the lock
      const result2 = await syncEngine2.sync();

      expect(result2.success).toBe(false);
      expect(result2.error).toContain('Sync lock held');

      // Unblock engine 1
      resolvePush();
      const result1 = await promise1;
      expect(result1.success).toBe(true);
    });

    it('cleans up local tenant data on logout', async () => {
      const customerRepo = new CustomerRepository(db, { tenantId, deviceId });
      await customerRepo.create({
        branchId,
        name: 'To Be Cleared',
        phone: '1231231234',
      });

      const syncEngine = new SyncEngine({
        db,
        tenantId,
        deviceId,
        pushTransport: vi.fn(),
        pullTransport: vi.fn(),
      });

      expect(await db.customers.count()).toBe(1);

      await syncEngine.cleanupOnLogout({ wipeAll: true });

      expect(await db.customers.count()).toBe(0);
      expect(await db.outbox.count()).toBe(0);
      expect(await db.syncState.count()).toBe(0);
    });
  });
});
