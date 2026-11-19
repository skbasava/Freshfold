import type { OrderStatus } from "@laundry/contracts";

export type DashboardOrderFilter =
  | "all"
  | "confirmed"
  | "processing"
  | "out_for_delivery"
  | "hold";

export type DashboardSlotDay = "today" | "tomorrow";

export interface DashboardOrder {
  id: string;
  crnId: string;
  customerName: string;
  serviceType: string;
  status: OrderStatus;
  deliverySlotLabel: string;
  deliverySlotId: string | null;
  holdComment: string | null;
}

export interface DashboardSlot {
  id: string;
  label: string;
  booked: number;
  capacity: number;
}

export interface DashboardKpiSummary {
  totalActive: number;
  confirmed: number;
  processing: number;
  outForDelivery: number;
  onHold: number;
  deliveredToday: number;
}

export interface DashboardSnapshot {
  orders: DashboardOrder[];
  slots: DashboardSlot[];
}

export interface DashboardFetchOptions {
  dateKey: string;
}

export interface DashboardService {
  fetchSnapshot(options: DashboardFetchOptions): Promise<DashboardSnapshot>;
}
