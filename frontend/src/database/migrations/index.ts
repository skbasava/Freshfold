import type { Transaction } from 'dexie';
import type { OutboxOperation, Order } from '../../domain/types';

export async function upgradeV1ToV2(tx: Transaction): Promise<void> {
  const defaultTenantId = 'tenant-default';
  const defaultBranchId = 'branch-main';

  // Migrate legacy orders if present
  try {
    const ordersTable = tx.table<any, string>('orders');
    await ordersTable.toCollection().modify((rawOrder: Record<string, unknown>) => {
      if (!rawOrder.tenantId) {
        rawOrder.tenantId = defaultTenantId;
      }
      if (!rawOrder.branchId) {
        rawOrder.branchId = (rawOrder.hubId as string) || defaultBranchId;
      }
      if (!rawOrder.orderNumber) {
        rawOrder.orderNumber = `ORD-LEGACY-${(rawOrder.id as string).slice(0, 8)}`;
      }
      if (!rawOrder.paymentStatus) {
        rawOrder.paymentStatus = 'unpaid';
      }
      if (typeof rawOrder.subtotalMinor !== 'number') {
        rawOrder.subtotalMinor = 0;
      }
      if (typeof rawOrder.discountMinor !== 'number') {
        rawOrder.discountMinor = 0;
      }
      if (typeof rawOrder.taxMinor !== 'number') {
        rawOrder.taxMinor = 0;
      }
      if (typeof rawOrder.totalMinor !== 'number') {
        rawOrder.totalMinor = 0;
      }
      if (!rawOrder.receivedAt) {
        rawOrder.receivedAt = (rawOrder.createdAt as number) || Date.now();
      }
      if (rawOrder.deletedAt === undefined) {
        rawOrder.deletedAt = null;
      }
    });
  } catch {
    // If orders table does not exist or empty, proceed
  }

  // Migrate legacy mutations to outbox operations if present
  try {
    const mutationsTable = tx.table<Record<string, unknown>, string>('mutations');
    const outboxTable = tx.table<OutboxOperation, string>('outbox');
    const legacyMutations = await mutationsTable.toArray();

    for (const legacy of legacyMutations) {
      const opId = (legacy.mutationId as string) || (legacy.id as string);
      if (!opId) continue;

      const outboxOp: OutboxOperation = {
        operationId: opId,
        tenantId: (legacy.tenantId as string) || defaultTenantId,
        deviceId: (legacy.deviceId as string) || 'legacy-device',
        entity: 'order',
        entityId: (legacy.orderId as string) || 'unknown',
        action: 'update',
        payload: (legacy.payload as Record<string, unknown>) || {},
        baseVersion: (legacy.baseVersion as number) || 1,
        createdAt: (legacy.createdAt as number) || Date.now(),
        retryCount: (legacy.retryCount as number) || 0,
        status: 'pending',
        lastError: null,
      };

      await outboxTable.put(outboxOp);
    }
  } catch {
    // If mutations table does not exist, proceed
  }
}
