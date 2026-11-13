import type { ApplyChangeIntent, OrderStatus } from "@laundry/contracts";

export type MutationStatus = "pending" | "rejected" | "conflict" | "synced";

export type LocalOrderSyncState =
  | "pending"
  | "synced"
  | "rejected"
  | "conflict";

export interface LocalOrder {
  id: string;
  hubId: string;
  branchId?: string;
  tenantId?: string;
  orderNumber?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  serviceType: string;
  deliverySlotId: string | null;
  deliveryAt: number | null;
  version: number;
  holdComment: string | null;
  createdAt: number;
  updatedAt: number;
  cancelledAt?: number | null;
  syncState: LocalOrderSyncState;
  lastError?: string | null;
}

export interface PendingMutation {
  mutationId: string;
  orderId: string;
  intent: ApplyChangeIntent;
  payload: unknown;
  baseVersion: number | null;
  createdAt: number;
  attempts: number;
  status: MutationStatus;
  lastError?: string | null;
  serverOrder?: LocalOrder | null;
}

export function isServerConfirmed(order: LocalOrder): boolean {
  return order.syncState === "synced";
}
