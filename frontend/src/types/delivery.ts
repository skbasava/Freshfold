import type { OrderSummary } from "./order";

export interface DeliverySlotSummary {
  id: string;
  label: string;
  startsAt: number;
  endsAt: number;
  capacity: number;
  booked: number;
  available: number;
}

export type DeliverySlotStatus = "open" | "full" | "closed" | "past";

export interface DeliverySlot extends DeliverySlotSummary {
  localDate: string;
  status: DeliverySlotStatus;
  closedReason: string | null;
}

export interface DeliverySchedule {
  date: string;
  dateLabel: string;
  slots: DeliverySlot[];
  orders: OrderSummary[];
  capacity: number;
  booked: number;
  available: number;
}

