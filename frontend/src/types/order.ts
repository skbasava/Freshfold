import type {
  ApplyChangeIntent,
  Customer,
  OrderStatus,
} from "@laundry/contracts";
import type { LocalOrderSyncState } from "../sync/types";
import type { DeliverySlot } from "./delivery";

export interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  serviceType: string | null;
}

export interface OrderSummary {
  id: string;
  crnId?: string | null;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  status: OrderStatus;
  previousState?: OrderStatus | null;
  serviceType: string;
  deliverySlotId: string | null;
  deliveryAt: number | null;
  version: number;
  holdComment: string | null;
  createdAt: number;
  updatedAt: number;
  cancelledAt: number | null;
  totalItems: number;
  syncState: LocalOrderSyncState;
  lastError: string | null;
}

export interface OrderDetail extends OrderSummary {
  customer: Customer;
  items: OrderItem[];
  deliverySlot: DeliverySlot | null;
  customerCreated?: boolean;
  stateSnapshot?: Record<string, unknown> | null;
}

export type OrderSort = "newest" | "oldest" | "delivery";
export type OrderStatusFilter = OrderStatus | "all" | "attention";

export interface OrderListQuery {
  search?: string;
  status?: OrderStatusFilter;
  sort?: OrderSort;
  page?: number;
  pageSize?: number;
}

export interface OrderListResult {
  items: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface CreateOrderItemInput {
  description: string;
  quantity: number;
}

export interface CreateOrderBaseInput {
  serviceType: string;
  deliverySlotId: string;
  items: CreateOrderItemInput[];
}

export type CreateOrderInput =
  | (CreateOrderBaseInput & { customerId: string })
  | (CreateOrderBaseInput & {
      customerName: string;
      customerPhone: string;
    });

export interface CreateOrderOptions {
  customers: Customer[];
  services: string[];
  slots: DeliverySlot[];
}

export interface UpdateOrderInput {
  serviceType?: string;
  deliverySlotId?: string;
  customerNotes?: string;
  status?: OrderStatus;
  holdComment?: string;
  comments?: string;
  reason?: string;
  items?: CreateOrderItemInput[];
}

export interface OrderMutationOptions {
  online?: boolean;
}

export type OrderIntent = Exclude<ApplyChangeIntent, "createOrder">;

