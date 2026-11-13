import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LaundryDatabase, createDatabase } from '../../database/db';
import {
  CustomerRepository,
  OrderRepository,
  PaymentRepository,
  OutboxRepository,
} from '../../repositories';
import {
  buildOrderedBatch,
  OutboxPushEngine,
  type BatchPushResult,
} from '../push';
import { connectivity } from '../connectivity';
import { computeBackoffDelay, shouldRetry } from '../retry';
import { OutboxScheduler } from '../scheduler';
import type { OutboxOperation } from '../../domain/types';

describe('Phase 2: Outbox Lifecycle, Ordering & Offline Resiliency', () => {
  let db: LaundryDatabase;
  const tenantId = 'tenant-xyz';
  const deviceId = 'device-tablet-1';

  beforeEach(async () => {
    connectivity.setMockOnline(true);
    db = createDatabase(`outbox-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    if (db && db.isOpen()) {
      await db.delete();
    }
  });

  describe('Offline Mutation Queuing', () => {
    it('queues mutations atomically in Dexie while offline', async () => {
      connectivity.setMockOnline(false);

      const customerRepo = new CustomerRepository(db, { tenantId, deviceId });
      const orderRepo = new OrderRepository(db, { tenantId, deviceId });
      const paymentRepo = new PaymentRepository(db, { tenantId, deviceId });

      // Create customer offline
      const customer = await customerRepo.create({
        branchId: 'b-1',
        name: 'Offline Customer',
        phone: '9876543210',
      });

      // Create order offline with items
      const order = await orderRepo.create(
        {
          branchId: 'b-1',
          customerId: customer.id,
          notes: 'Customer dropped clothes offline',
        },
        [
          {
            orderId: '',
            serviceId: 'srv-wash',
            description: 'Jeans',
            quantity: 2,
            unitPriceMinor: 8000,
          },
        ]
      );

      // Record offline payment (must be pending)
      const payment = await paymentRepo.recordPayment({
        orderId: order.id,
        amountMinor: 16000,
        method: 'cash',
      });

      expect(payment.status).toBe('pending');
      expect(payment.confirmedAt).toBeNull();

      // Verify all outbox operations are queued with status pending
      const outboxRepo = new OutboxRepository(db, { tenantId, deviceId });
      expect(await outboxRepo.countPending()).toBe(4); // customer + order + item + payment

      const pending = await outboxRepo.getPending();
      expect(pending.map((p) => p.entity)).toEqual([
        'customer',
        'orderItem',
        'order',
        'payment',
      ]);
    });
  });

  describe('Operation Ordering & Dependency Tracking', () => {
    it('strictly preserves FIFO ordering and cross-entity order-creation dependency', () => {
      const baseTime = 1700000000000;

      const ops: OutboxOperation[] = [
        {
          operationId: 'op-item-1',
          tenantId,
          deviceId,
          entity: 'orderItem',
          entityId: 'item-1',
          action: 'create',
          payload: { orderId: 'ord-100' },
          baseVersion: 0,
          createdAt: baseTime + 10,
          retryCount: 0,
          status: 'pending',
          lastError: null,
        },
        {
          operationId: 'op-order-1',
          tenantId,
          deviceId,
          entity: 'order',
          entityId: 'ord-100',
          action: 'create',
          payload: { orderNumber: 'ORD-100' },
          baseVersion: 0,
          createdAt: baseTime + 5,
          retryCount: 0,
          status: 'pending',
          lastError: null,
        },
        {
          operationId: 'op-payment-1',
          tenantId,
          deviceId,
          entity: 'payment',
          entityId: 'pay-1',
          action: 'payment',
          payload: { orderId: 'ord-100' },
          baseVersion: 0,
          createdAt: baseTime + 15,
          retryCount: 0,
          status: 'pending',
          lastError: null,
        },
      ];

      // Even if item was in the array, ordered batch sorts by createdAt and ensures
      // order creation precedes item and payment
      const batch = buildOrderedBatch(ops, 10);
      expect(batch.map((b) => b.operationId)).toEqual([
        'op-order-1',
        'op-item-1',
        'op-payment-1',
      ]);
    });
  });

  describe('Partial Batch Acknowledgements & Conflicts', () => {
    it('handles partial acks, records conflicts, and retains unacknowledged operations', async () => {
      const outboxRepo = new OutboxRepository(db, { tenantId, deviceId });

      const op1 = await outboxRepo.add({
        entity: 'customer',
        entityId: 'c-1',
        action: 'create',
        payload: { name: 'Alice' },
        baseVersion: 0,
      });

      const op2 = await outboxRepo.add({
        entity: 'order',
        entityId: 'o-1',
        action: 'update',
        payload: { notes: 'Updated notes' },
        baseVersion: 1,
      });

      const op3 = await outboxRepo.add({
        entity: 'order',
        entityId: 'o-2',
        action: 'status_change',
        payload: { newStatus: 'washing' },
        baseVersion: 2,
      });

      const op4 = await outboxRepo.add({
        entity: 'payment',
        entityId: 'p-1',
        action: 'payment',
        payload: { amountMinor: 5000 },
        baseVersion: 0,
      });

      const pushEngine = new OutboxPushEngine(db, tenantId);

      // Claim batch
      const batch = await pushEngine.claimNextBatch(10);
      expect(batch).toHaveLength(4);
      expect(batch.every((b) => b.status === 'in_flight')).toBe(true);

      // Simulated server response:
      // op1: acknowledged
      // op2: version conflict
      // op3: error
      // op4: skipped / unmentioned (e.g. server stopped early)
      const serverResponse: BatchPushResult = {
        acknowledged: [op1.operationId],
        conflicts: [
          {
            operationId: op2.operationId,
            entity: 'order',
            entityId: 'o-1',
            baseVersion: 1,
            serverVersion: 3,
            serverPayload: { notes: 'Server updated notes' },
            message: 'Version mismatch: base 1, server 3',
          },
        ],
        errors: [
          {
            operationId: op3.operationId,
            error: 'Database lock timeout',
            canRetry: true,
          },
        ],
      };

      const result = await pushEngine.processBatchResponse(batch, serverResponse);
      expect(result.acknowledgedCount).toBe(1);
      expect(result.conflictCount).toBe(1);
      expect(result.errorCount).toBe(1);

      // op1: deleted from outbox
      expect(await outboxRepo.getById(op1.operationId)).toBeUndefined();

      // op2: recorded in conflicts table, marked failed in outbox
      const conflictRecord = await db.conflicts
        .where('operationId')
        .equals(op2.operationId)
        .first();
      expect(conflictRecord).toBeDefined();
      expect(conflictRecord?.serverVersion).toBe(3);
      expect(conflictRecord?.resolved).toBe(false);

      const op2InDb = await outboxRepo.getById(op2.operationId);
      expect(op2InDb?.status).toBe('failed');
      expect(op2InDb?.lastError).toContain('Version mismatch');

      // op3: marked failed with incremented retry count
      const op3InDb = await outboxRepo.getById(op3.operationId);
      expect(op3InDb?.status).toBe('failed');
      expect(op3InDb?.retryCount).toBe(1);
      expect(op3InDb?.lastError).toBe('Database lock timeout');

      // op4: unmentioned, safely reverted back to pending
      const op4InDb = await outboxRepo.getById(op4.operationId);
      expect(op4InDb?.status).toBe('pending');
    });

    it('does not overwrite newer local edits when an older operation is acknowledged', async () => {
      const customerRepo = new CustomerRepository(db, { tenantId, deviceId });

      // Create customer
      const cust = await customerRepo.create({
        branchId: 'b-1',
        name: 'Original Name',
        phone: '1234567890',
      });

      // User makes a newer local update while first op is still in outbox
      const updated = await customerRepo.update(
        cust.id,
        { name: 'Newer Name' },
        cust.version
      );
      expect(updated.name).toBe('Newer Name');
      expect(updated.version).toBe(2);

      const pushEngine = new OutboxPushEngine(db, tenantId);
      const batch = await pushEngine.claimNextBatch(1);
      expect(batch[0].action).toBe('create');

      // Server acknowledges create operation
      await pushEngine.processBatchResponse(batch, {
        acknowledged: [batch[0].operationId],
      });

      // Verify local customer still has the newer edit 'Newer Name'
      const freshLocal = await customerRepo.getById(cust.id);
      expect(freshLocal?.name).toBe('Newer Name');
      expect(freshLocal?.version).toBe(2);
    });
  });

  describe('Stuck In-Flight Timeout Recovery', () => {
    it('resets timed-out in_flight operations back to pending', async () => {
      const outboxRepo = new OutboxRepository(db, { tenantId, deviceId });

      const op = await outboxRepo.add({
        entity: 'order',
        entityId: 'o-timeout',
        action: 'create',
        payload: {},
        baseVersion: 0,
      });

      // Mark in_flight
      await outboxRepo.markInFlight([op.operationId]);

      // Age the operation past the timeout limit
      await db.outbox.update(op.operationId, {
        createdAt: Date.now() - 70_000,
      });

      const pushEngine = new OutboxPushEngine(db, tenantId, {
        inFlightTimeoutMs: 60_000,
      });

      const recovered = await pushEngine.recoverStuckInFlight(60_000);
      expect(recovered).toBe(1);

      const opAfter = await outboxRepo.getById(op.operationId);
      expect(opAfter?.status).toBe('pending');
      expect(opAfter?.lastError).toContain('in-flight timeout');
    });
  });

  describe('Exponential Backoff & Jitter', () => {
    it('calculates bounded delays with exponential growth', () => {
      const opts = { baseDelayMs: 1000, maxDelayMs: 10000, factor: 2, jitter: false };

      expect(computeBackoffDelay(0, opts)).toBe(1000);
      expect(computeBackoffDelay(1, opts)).toBe(2000);
      expect(computeBackoffDelay(2, opts)).toBe(4000);
      expect(computeBackoffDelay(3, opts)).toBe(8000);
      expect(computeBackoffDelay(4, opts)).toBe(10000); // capped at maxDelayMs

      expect(shouldRetry(0, 3)).toBe(true);
      expect(shouldRetry(2, 3)).toBe(true);
      expect(shouldRetry(3, 3)).toBe(false);
    });

    it('generates non-negative jittered delays within the delay bound', () => {
      for (let i = 0; i < 20; i++) {
        const delay = computeBackoffDelay(2, {
          baseDelayMs: 1000,
          maxDelayMs: 10000,
          factor: 2,
          jitter: true,
        });
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(4000);
      }
    });
  });

  describe('Outbox Scheduler & Network Reconnection', () => {
    it('triggers flush automatically when reconnecting online', async () => {
      const outboxRepo = new OutboxRepository(db, { tenantId, deviceId });
      const op = await outboxRepo.add({
        entity: 'customer',
        entityId: 'c-auto',
        action: 'create',
        payload: { name: 'Auto Sync' },
        baseVersion: 0,
      });

      const mockTransport = vi.fn().mockImplementation(async (ops: OutboxOperation[]) => {
        return {
          acknowledged: ops.map((o) => o.operationId),
        } satisfies BatchPushResult;
      });

      connectivity.setMockOnline(false);

      const scheduler = new OutboxScheduler(db, tenantId, mockTransport);
      scheduler.start();

      // While offline, no transport calls
      expect(mockTransport).not.toHaveBeenCalled();

      // Go online
      connectivity.setMockOnline(true);

      // Wait for async flush to execute
      await vi.waitFor(() => expect(mockTransport).toHaveBeenCalledTimes(1));

      scheduler.stop();
    });

    it('prevents overlapping flush executions via sync lock', async () => {
      const outboxRepo = new OutboxRepository(db, { tenantId, deviceId });
      await outboxRepo.add({
        entity: 'customer',
        entityId: 'c-lock',
        action: 'create',
        payload: {},
        baseVersion: 0,
      });

      let resolveTransport: (value: BatchPushResult) => void;
      const slowTransport = vi.fn().mockImplementation(
        () =>
          new Promise<BatchPushResult>((resolve) => {
            resolveTransport = resolve;
          })
      );

      const scheduler = new OutboxScheduler(db, tenantId, slowTransport);

      // Start first flush (asynchronously claims and starts transport)
      const flush1 = scheduler.flush();

      // Wait until transport is active
      await vi.waitFor(() => expect(slowTransport).toHaveBeenCalledTimes(1));

      // Attempt concurrent second flush while first is active
      const flush2 = scheduler.flush();
      await flush2;

      // Transport was still only called once
      expect(slowTransport).toHaveBeenCalledTimes(1);

      // Resolve first flush
      resolveTransport!({ acknowledged: [] });
      await flush1;
    });
  });
});
