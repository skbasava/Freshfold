import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LaundryDatabase, createDatabase } from '../../database/db';
import {
  CustomerRepository,
  BranchRepository,
  ServiceRepository,
  OrderItemRepository,
  OrderRepository,
  PaymentRepository,
  OutboxRepository,
  SyncStateRepository,
  DeviceRepository,
} from '../index';

describe('Multi-Tenant Repositories', () => {
  let db: LaundryDatabase;
  const tenantA = 'tenant-alpha';
  const tenantB = 'tenant-beta';
  const deviceA = 'device-alpha-1';
  const deviceB = 'device-beta-1';

  beforeEach(async () => {
    db = createDatabase(`repo-test-${crypto.randomUUID()}`);
    await db.open();
  });

  afterEach(async () => {
    if (db && db.isOpen()) {
      await db.delete();
    }
  });

  describe('CustomerRepository', () => {
    it('creates customer and an outbox operation atomically', async () => {
      const repo = new CustomerRepository(db, { tenantId: tenantA, deviceId: deviceA });
      const customer = await repo.create({
        branchId: 'branch-1',
        name: 'Aarav Sharma',
        phone: '+919876543210',
        email: 'aarav@example.com',
        notes: 'Regular laundry',
      });

      expect(customer.id).toBeDefined();
      expect(customer.tenantId).toBe(tenantA);
      expect(customer.version).toBe(1);
      expect(customer.deletedAt).toBeNull();

      // Check customer stored in DB
      const stored = await repo.getById(customer.id);
      expect(stored).toEqual(customer);

      // Check atomic outbox operation
      const outboxOps = await db.outbox.where('tenantId').equals(tenantA).toArray();
      expect(outboxOps).toHaveLength(1);
      expect(outboxOps[0].entity).toBe('customer');
      expect(outboxOps[0].entityId).toBe(customer.id);
      expect(outboxOps[0].action).toBe('create');
      expect(outboxOps[0].status).toBe('pending');
      expect(outboxOps[0].baseVersion).toBe(0);
    });

    it('updates customer, increments version and adds outbox op', async () => {
      const repo = new CustomerRepository(db, { tenantId: tenantA, deviceId: deviceA });
      const customer = await repo.create({
        branchId: 'branch-1',
        name: 'Aarav Sharma',
        phone: '+919876543210',
      });

      const updated = await repo.update(
        customer.id,
        { name: 'Aarav S.', notes: 'Preferred detergent: gentle' },
        customer.version
      );

      expect(updated.version).toBe(2);
      expect(updated.name).toBe('Aarav S.');
      expect(updated.notes).toBe('Preferred detergent: gentle');

      const outboxOps = await db.outbox
        .where('tenantId')
        .equals(tenantA)
        .sortBy('createdAt');
      expect(outboxOps).toHaveLength(2);
      expect(outboxOps[0].action).toBe('create');
      expect(outboxOps[1].action).toBe('update');
      expect(outboxOps[1].baseVersion).toBe(1);
    });

    it('enforces tenant isolation and filtering', async () => {
      const repoA = new CustomerRepository(db, { tenantId: tenantA, deviceId: deviceA });
      const repoB = new CustomerRepository(db, { tenantId: tenantB, deviceId: deviceB });

      const custA = await repoA.create({
        branchId: 'branch-1',
        name: 'Customer A',
        phone: '1111111111',
      });

      const custB = await repoB.create({
        branchId: 'branch-2',
        name: 'Customer B',
        phone: '2222222222',
      });

      // Tenant A cannot get Tenant B's customer
      expect(await repoA.getById(custB.id)).toBeUndefined();
      expect(await repoB.getById(custA.id)).toBeUndefined();

      // Listing is strictly tenant-scoped
      const listA = await repoA.list();
      expect(listA).toHaveLength(1);
      expect(listA[0].id).toBe(custA.id);

      // Search filter works
      const searchResult = await repoA.list({ search: 'Customer A' });
      expect(searchResult).toHaveLength(1);

      const noMatch = await repoA.list({ search: 'NonExistent' });
      expect(noMatch).toHaveLength(0);
    });

    it('soft deletes customer and creates delete outbox operation', async () => {
      const repo = new CustomerRepository(db, { tenantId: tenantA, deviceId: deviceA });
      const customer = await repo.create({
        branchId: 'branch-1',
        name: 'To Delete',
        phone: '9999999999',
      });

      await repo.softDelete(customer.id, customer.version);

      const regularList = await repo.list();
      expect(regularList).toHaveLength(0);

      const listWithDeleted = await repo.list({ includeDeleted: true });
      expect(listWithDeleted).toHaveLength(1);
      expect(listWithDeleted[0].deletedAt).not.toBeNull();
    });
  });

  describe('BranchRepository', () => {
    it('creates, updates and lists branches', async () => {
      const repo = new BranchRepository(db, { tenantId: tenantA, deviceId: deviceA });
      const branch = await repo.create({
        name: 'Koramangala Hub',
        code: 'KOR-01',
        address: '5th Block Koramangala',
        isActive: true,
      });

      expect(branch.code).toBe('KOR-01');
      expect(branch.version).toBe(1);

      const updated = await repo.update(
        branch.id,
        { name: 'Koramangala Mega Hub' },
        branch.version
      );
      expect(updated.name).toBe('Koramangala Mega Hub');
      expect(updated.version).toBe(2);

      const list = await repo.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(branch.id);
    });
  });

  describe('ServiceRepository', () => {
    it('validates minor units and creates service with outbox op', async () => {
      const repo = new ServiceRepository(db, { tenantId: tenantA, deviceId: deviceA });

      // Rejects negative unitPriceMinor
      await expect(
        repo.create({
          name: 'Invalid Price Service',
          pricingUnit: 'piece',
          unitPriceMinor: -100,
        })
      ).rejects.toThrow('unitPriceMinor must be a non-negative integer');

      // Rejects non-integer minor units
      await expect(
        repo.create({
          name: 'Invalid Float Service',
          pricingUnit: 'kg',
          unitPriceMinor: 49.99,
        })
      ).rejects.toThrow('unitPriceMinor must be a non-negative integer');

      const service = await repo.create({
        name: 'Wash & Fold',
        pricingUnit: 'kg',
        unitPriceMinor: 8000, // 80.00 INR (8000 paise)
      });

      expect(service.unitPriceMinor).toBe(8000);
      expect(service.version).toBe(1);

      const outbox = await db.outbox.where('tenantId').equals(tenantA).first();
      expect(outbox?.entity).toBe('service');
    });
  });

  describe('OrderRepository & OrderItemRepository', () => {
    it('creates order with items and atomic outbox records in one transaction', async () => {
      const orderRepo = new OrderRepository(db, { tenantId: tenantA, deviceId: deviceA });

      const order = await orderRepo.create(
        {
          branchId: 'branch-1',
          customerId: 'cust-1',
          notes: 'Express laundry needed',
        },
        [
          {
            orderId: '', // populated by create
            serviceId: 'srv-1',
            description: 'Cotton Shirts',
            quantity: 3,
            unitPriceMinor: 6000, // 60.00 each
          },
          {
            orderId: '',
            serviceId: 'srv-2',
            description: 'Trousers Dry Clean',
            quantity: 2,
            unitPriceMinor: 15000, // 150.00 each
          },
        ]
      );

      expect(order.id).toBeDefined();
      expect(order.status).toBe('received');
      expect(order.paymentStatus).toBe('unpaid');
      expect(order.subtotalMinor).toBe(3 * 6000 + 2 * 15000); // 18000 + 30000 = 48000
      expect(order.totalMinor).toBe(48000);

      // Verify items saved
      const detailed = await orderRepo.getWithItems(order.id);
      expect(detailed).toBeDefined();
      expect(detailed?.items).toHaveLength(2);

      // Outbox has 3 operations (2 items + 1 order)
      const outboxOps = await db.outbox.where('tenantId').equals(tenantA).toArray();
      expect(outboxOps).toHaveLength(3);
    });

    it('enforces order status lifecycle and rejects invalid transitions', async () => {
      const orderRepo = new OrderRepository(db, { tenantId: tenantA, deviceId: deviceA });
      const order = await orderRepo.create({
        branchId: 'branch-1',
        customerId: 'cust-1',
      });

      expect(order.status).toBe('received');

      // Valid: received -> inspection
      const step1 = await orderRepo.updateStatus(order.id, 'inspection', order.version);
      expect(step1.status).toBe('inspection');
      expect(step1.version).toBe(2);

      // Valid: inspection -> washing
      const step2 = await orderRepo.updateStatus(order.id, 'washing', step1.version);
      expect(step2.status).toBe('washing');
      expect(step2.version).toBe(3);

      // Invalid: washing -> delivered (cannot jump stages)
      await expect(
        orderRepo.updateStatus(order.id, 'delivered', step2.version)
      ).rejects.toThrow('Invalid status transition');

      // Valid: cancellation is allowed from intermediate states
      const cancelled = await orderRepo.updateStatus(order.id, 'cancelled', step2.version);
      expect(cancelled.status).toBe('cancelled');
    });

    it('updates payment status independently', async () => {
      const orderRepo = new OrderRepository(db, { tenantId: tenantA, deviceId: deviceA });
      const order = await orderRepo.create({
        branchId: 'branch-1',
        customerId: 'cust-1',
      });

      expect(order.paymentStatus).toBe('unpaid');

      const updated = await orderRepo.updatePaymentStatus(
        order.id,
        'paid',
        order.version
      );
      expect(updated.paymentStatus).toBe('paid');
    });
  });

  describe('PaymentRepository', () => {
    it('records payment as append-only with pending status by default', async () => {
      const repo = new PaymentRepository(db, { tenantId: tenantA, deviceId: deviceA });

      const payment = await repo.recordPayment({
        orderId: 'order-123',
        amountMinor: 48000,
        method: 'UPI',
        providerReference: 'upi_ref_abc123',
      });

      expect(payment.id).toBeDefined();
      expect(payment.status).toBe('pending'); // Invariant: offline client cannot mark confirmed
      expect(payment.confirmedAt).toBeNull();
      expect(payment.amountMinor).toBe(48000);

      const outbox = await db.outbox.where('tenantId').equals(tenantA).first();
      expect(outbox?.entity).toBe('payment');
      expect(outbox?.action).toBe('payment');
    });

    it('creates append-only refund record linked to original transaction', async () => {
      const repo = new PaymentRepository(db, { tenantId: tenantA, deviceId: deviceA });

      const payment = await repo.recordPayment({
        orderId: 'order-123',
        amountMinor: 48000,
        method: 'card',
      });

      const refund = await repo.recordRefund({
        orderId: 'order-123',
        originalPaymentId: payment.id,
        amountMinor: 48000,
        method: 'card',
        reason: 'Customer cancelled before wash',
      });

      expect(refund.id).toBeDefined();
      expect(refund.providerReference).toContain(payment.id);

      const orderPayments = await repo.listByOrder('order-123');
      expect(orderPayments).toHaveLength(2);
    });
  });

  describe('OutboxRepository', () => {
    it('manages pending operations, in_flight transitions, failures and acknowledgements', async () => {
      const repo = new OutboxRepository(db, { tenantId: tenantA, deviceId: deviceA });

      const op1 = await repo.add({
        entity: 'order',
        entityId: 'ord-1',
        action: 'create',
        payload: { orderNumber: 'ORD-1' },
        baseVersion: 0,
      });

      const op2 = await repo.add({
        entity: 'order',
        entityId: 'ord-2',
        action: 'create',
        payload: { orderNumber: 'ORD-2' },
        baseVersion: 0,
      });

      expect(await repo.countPending()).toBe(2);

      const pending = await repo.getPending();
      expect(pending).toHaveLength(2);
      expect(pending[0].operationId).toBe(op1.operationId);

      // Mark in_flight
      await repo.markInFlight([op1.operationId]);
      expect(await repo.countPending()).toBe(1);

      // Mark failed
      await repo.markFailed(op1.operationId, 'Network timeout');
      const failedOp = await repo.getById(op1.operationId);
      expect(failedOp?.status).toBe('failed');
      expect(failedOp?.retryCount).toBe(1);
      expect(failedOp?.lastError).toBe('Network timeout');

      // Mark acknowledged removes operation cleanly
      await repo.markAcknowledged(op2.operationId);
      expect(await repo.getById(op2.operationId)).toBeUndefined();
    });

    it('recovers stuck in_flight operations on resetInFlight', async () => {
      const repo = new OutboxRepository(db, { tenantId: tenantA, deviceId: deviceA });

      const op = await repo.add({
        entity: 'order',
        entityId: 'ord-recover',
        action: 'create',
        payload: {},
        baseVersion: 0,
      });

      await repo.markInFlight([op.operationId]);
      expect(await repo.countPending()).toBe(0);

      const resetCount = await repo.resetInFlight();
      expect(resetCount).toBe(1);
      expect(await repo.countPending()).toBe(1);
    });
  });

  describe('SyncStateRepository', () => {
    it('tracks monotonically increasing sequence cursors per dataset', async () => {
      const repo = new SyncStateRepository(db, { tenantId: tenantA, deviceId: deviceA });

      expect(await repo.getCursor('orders')).toBe(0);

      await repo.setCursor('orders', 42);
      expect(await repo.getCursor('orders')).toBe(42);

      await repo.setCursor('orders', 105, 'idle');
      expect(await repo.getCursor('orders')).toBe(105);

      const state = await repo.getState('orders');
      expect(state?.lastCursor).toBe(105);
      expect(state?.status).toBe('idle');
    });
  });

  describe('DeviceRepository', () => {
    it('registers device, tracks last seen, and checks revocation', async () => {
      const repo = new DeviceRepository(db, { tenantId: tenantA, deviceId: deviceA });

      const device = await repo.registerDevice({
        userId: 'user-operator-1',
        deviceName: 'Counter iPad 2',
        platform: 'ios-tablet',
      });

      expect(device.id).toBe(deviceA);
      expect(await repo.isRevoked()).toBe(false);

      await repo.setRevoked(deviceA, true);
      expect(await repo.isRevoked()).toBe(true);
    });
  });
});

