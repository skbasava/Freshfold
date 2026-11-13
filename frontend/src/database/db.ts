import Dexie, { type EntityTable, type DexieOptions } from 'dexie';
import type {
  Tenant,
  Branch,
  Customer,
  Service,
  Order,
  OrderItem,
  Payment,
  OutboxOperation,
  SyncStateRecord,
  SyncConflictRecord,
  DeviceRegistration,
} from '../domain/types';
import { DB_NAME, SCHEMA_V1, SCHEMA_V2 } from './schema';
import { upgradeV1ToV2 } from './migrations';

export class LaundryDatabase extends Dexie {
  tenants!: EntityTable<Tenant, 'id'>;
  branches!: EntityTable<Branch, 'id'>;
  customers!: EntityTable<Customer, 'id'>;
  services!: EntityTable<Service, 'id'>;
  orders!: EntityTable<Order, 'id'>;
  orderItems!: EntityTable<OrderItem, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  outbox!: EntityTable<OutboxOperation, 'operationId'>;
  syncState!: EntityTable<SyncStateRecord, 'id'>;
  conflicts!: EntityTable<SyncConflictRecord, 'id'>;
  devices!: EntityTable<DeviceRegistration, 'id'>;

  constructor(customName = DB_NAME, options?: DexieOptions) {
    super(customName, options);

    // Version 1: Legacy store definition
    this.version(1).stores(SCHEMA_V1);

    // Version 2: Multi-Tenant local-first schema with upgrade handler
    this.version(2)
      .stores(SCHEMA_V2)
      .upgrade((tx) => upgradeV1ToV2(tx));
  }
}

let dbInstance: LaundryDatabase | null = null;

export function getDatabase(customName?: string, options?: DexieOptions): LaundryDatabase {
  if (!dbInstance || (customName && dbInstance.name !== customName)) {
    dbInstance = new LaundryDatabase(customName, options);
  }
  return dbInstance;
}

export function createDatabase(name: string, options?: DexieOptions): LaundryDatabase {
  return new LaundryDatabase(name, options);
}

export async function resetDatabase(db: LaundryDatabase): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.tenants,
      db.branches,
      db.customers,
      db.services,
      db.orders,
      db.orderItems,
      db.payments,
      db.outbox,
      db.syncState,
      db.conflicts,
      db.devices,
    ],
    async () => {
      await Promise.all([
        db.tenants.clear(),
        db.branches.clear(),
        db.customers.clear(),
        db.services.clear(),
        db.orders.clear(),
        db.orderItems.clear(),
        db.payments.clear(),
        db.outbox.clear(),
        db.syncState.clear(),
        db.conflicts.clear(),
        db.devices.clear(),
      ]);
    }
  );
}
