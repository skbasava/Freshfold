import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import { getDatabase, type LaundryDatabase } from '../database/db';
import { OrderRepository } from '../repositories/order.repository';
import type { Order, OrderStatus, PaymentStatus } from '../domain/types';

export interface UseOrdersOptions {
  tenantId: string;
  deviceId?: string;
  branchId?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  search?: string;
  db?: LaundryDatabase;
}

export interface UseOrdersReturn {
  orders: Order[];
  isLoading: boolean;
  count: number;
  advanceStatus: (orderId: string, newStatus: OrderStatus, baseVersion?: number) => Promise<Order>;
}

export function useOrders({
  tenantId,
  deviceId = 'web-client',
  branchId,
  status,
  paymentStatus,
  search,
  db: customDb,
}: UseOrdersOptions): UseOrdersReturn {
  const db = customDb ?? getDatabase();

  const orders = useLiveQuery(
    async () => {
      let collection = db.orders.where('tenantId').equals(tenantId);

      let list = await collection.toArray();

      // Apply in-memory filters for branch, status, soft-delete, and search
      list = list.filter((order) => {
        if (order.deletedAt) return false;
        if (branchId && order.branchId !== branchId) return false;
        if (status && order.status !== status) return false;
        if (paymentStatus && order.paymentStatus !== paymentStatus) return false;

        if (search && search.trim().length > 0) {
          const q = search.trim().toLowerCase();
          const matchNumber = order.orderNumber.toLowerCase().includes(q);
          const matchNotes = order.notes ? order.notes.toLowerCase().includes(q) : false;
          if (!matchNumber && !matchNotes) return false;
        }

        return true;
      });

      // Sort by receivedAt descending (newest first)
      list.sort((a, b) => b.receivedAt - a.receivedAt);

      return list;
    },
    [tenantId, branchId, status, paymentStatus, search],
    undefined
  );

  const advanceStatus = useCallback(
    async (orderId: string, newStatus: OrderStatus, baseVersion?: number): Promise<Order> => {
      const repo = new OrderRepository(db, { tenantId, deviceId });
      let versionToUse = baseVersion;
      if (versionToUse === undefined) {
        const current = await db.orders.get(orderId);
        versionToUse = current?.version ?? 1;
      }
      return await repo.updateStatus(orderId, newStatus, versionToUse);
    },
    [db, tenantId, deviceId]
  );

  return {
    orders: orders ?? [],
    isLoading: orders === undefined,
    count: orders?.length ?? 0,
    advanceStatus,
  };
}
