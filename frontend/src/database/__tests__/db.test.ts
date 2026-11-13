import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LaundryDatabase, createDatabase, resetDatabase } from '../db';
import { DB_NAME } from '../schema';
import Dexie from 'dexie';

describe('LaundryDatabase & Migrations', () => {
  let db: LaundryDatabase;

  beforeEach(() => {
    const testDbName = `test-db-${crypto.randomUUID()}`;
    db = createDatabase(testDbName);
  });

  afterEach(async () => {
    if (db && db.isOpen()) {
      await db.delete();
    }
  });

  it('initializes the database with all required v2 tables', async () => {
    await db.open();
    expect(db.isOpen()).toBe(true);

    const tables = db.tables.map((t) => t.name);
    expect(tables).toContain('tenants');
    expect(tables).toContain('branches');
    expect(tables).toContain('customers');
    expect(tables).toContain('services');
    expect(tables).toContain('orders');
    expect(tables).toContain('orderItems');
    expect(tables).toContain('payments');
    expect(tables).toContain('outbox');
    expect(tables).toContain('syncState');
    expect(tables).toContain('conflicts');
    expect(tables).toContain('devices');
  });

  it('clears all data when resetDatabase is called', async () => {
    await db.open();

    await db.tenants.add({
      id: 'tenant-1',
      name: 'FreshFold HQ',
      slug: 'freshfold-hq',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await db.branches.add({
      id: 'branch-1',
      tenantId: 'tenant-1',
      name: 'Indiranagar',
      code: 'IND-01',
      address: '100 Feet Rd',
      isActive: true,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    });

    expect(await db.tenants.count()).toBe(1);
    expect(await db.branches.count()).toBe(1);

    await resetDatabase(db);

    expect(await db.tenants.count()).toBe(0);
    expect(await db.branches.count()).toBe(0);
  });

  it('migrates legacy v1 database data to v2 without destroying records', async () => {
    const legacyDbName = `legacy-test-${crypto.randomUUID()}`;

    // Create a legacy v1 database using raw Dexie
    const legacyDb = new Dexie(legacyDbName);
    legacyDb.version(1).stores({
      orders: 'id',
      mutations: 'mutationId, orderId',
      meta: 'key',
    });
    await legacyDb.open();

    // Insert legacy v1 records
    await legacyDb.table('orders').add({
      id: 'order-legacy-123',
      hubId: 'hub-blr',
      customerId: 'cust-legacy-1',
      status: 'confirmed',
      serviceType: 'dry_clean',
      createdAt: 1700000000000,
    });

    await legacyDb.table('mutations').add({
      mutationId: 'mut-123',
      orderId: 'order-legacy-123',
      payload: { notes: 'urgent' },
      createdAt: 1700000001000,
    });

    await legacyDb.close();

    // Now open with LaundryDatabase (which runs version 2 upgrade)
    const upgradedDb = createDatabase(legacyDbName);
    await upgradedDb.open();

    // Check migrated order
    const migratedOrder = await upgradedDb.orders.get('order-legacy-123');
    expect(migratedOrder).toBeDefined();
    expect(migratedOrder?.id).toBe('order-legacy-123');
    expect(migratedOrder?.tenantId).toBe('tenant-default');
    expect(migratedOrder?.branchId).toBe('hub-blr');
    expect(migratedOrder?.paymentStatus).toBe('unpaid');
    expect(migratedOrder?.orderNumber).toContain('ORD-LEGACY');

    // Check migrated outbox operation
    const migratedOutbox = await upgradedDb.outbox.get('mut-123');
    expect(migratedOutbox).toBeDefined();
    expect(migratedOutbox?.operationId).toBe('mut-123');
    expect(migratedOutbox?.entity).toBe('order');
    expect(migratedOutbox?.entityId).toBe('order-legacy-123');
    expect(migratedOutbox?.status).toBe('pending');

    await upgradedDb.delete();
  });
});

