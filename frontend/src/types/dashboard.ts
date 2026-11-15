import type { OrderStatus } from "@laundry/contracts";
import type { LocalOrderSyncState } from "../sync/types";
import type { CustomerSummary } from "./customer";
import type { DeliverySlotSummary } from "./delivery";

export interface DashboardSummary {
  ordersToday: number;
  readyForDelivery: number;
  outForDelivery: number;
  needsAttention: number;
  capacityUsed: number;
  capacityTotal: number;
}

export type AttentionTone = "warning" | "danger" | "info";

export interface AttentionItem {
  id: string;
  orderId: string;
  customerName: string;
  reason: string;
  status: OrderStatus | "conflict";
  tone: AttentionTone;
  actionLabel: string;
  href: string;
}

export interface DashboardOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  serviceType: string;
  deliveryAt: number | null;
  totalItems: number;
  syncState: LocalOrderSyncState;
  version: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  attention: AttentionItem[];
  recentOrders: DashboardOrder[];
  customers: CustomerSummary[];
  deliverySlots: DeliverySlotSummary[];
  deliveryOrders: DashboardOrder[];
}

