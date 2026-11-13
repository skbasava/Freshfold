import type {
  ApplyChangeIntent,
  Customer,
  OrderStatus,
  Role,
} from "@laundry/contracts";
import type { LocalOrderSyncState } from "../sync/types";

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

export interface DeliverySlotSummary {
  id: string;
  label: string;
  startsAt: number;
  endsAt: number;
  capacity: number;
  booked: number;
  available: number;
}

export type CustomerSummary = Customer;

export interface DashboardData {
  summary: DashboardSummary;
  attention: AttentionItem[];
  recentOrders: DashboardOrder[];
  customers: CustomerSummary[];
  deliverySlots: DeliverySlotSummary[];
  deliveryOrders: DashboardOrder[];
}

export type DeliverySlotStatus = "open" | "full" | "closed" | "past";

export interface MockDeliverySlot extends DeliverySlotSummary {
  localDate: string;
  status: DeliverySlotStatus;
  closedReason: string | null;
}

export interface MockOrderItem {
  id: string;
  description: string;
  quantity: number;
  serviceType: string | null;
}

export interface MockOrderSummary {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  status: OrderStatus;
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

export interface MockOrderDetail extends MockOrderSummary {
  customer: CustomerSummary;
  items: MockOrderItem[];
  deliverySlot: MockDeliverySlot | null;
  customerCreated?: boolean;
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
  items: MockOrderSummary[];
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
  customers: CustomerSummary[];
  services: string[];
  slots: MockDeliverySlot[];
}

export interface OrderMutationOptions {
  online?: boolean;
}

export type MockOrderIntent = Exclude<ApplyChangeIntent, "createOrder">;

export interface DeliverySchedule {
  date: string;
  dateLabel: string;
  slots: MockDeliverySlot[];
  orders: MockOrderSummary[];
  capacity: number;
  booked: number;
  available: number;
}

export interface MockCustomerSummary extends CustomerSummary {
  orderCount: number;
  lastOrderAt: number | null;
}

export interface CustomerListQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomerListResult {
  items: MockCustomerSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface MockCustomerDetail {
  customer: CustomerSummary;
  orders: MockOrderSummary[];
}

export interface MockSession {
  user: {
    name: string;
    role: Role;
  };
  hub: {
    id: string;
    name: string;
  };
  today: number;
}

export interface MockApi {
  getDashboardData(): Promise<DashboardData>;
  getSummary(): Promise<DashboardSummary>;
  getAttentionItems(): Promise<AttentionItem[]>;
  getRecentOrders(limit?: number): Promise<DashboardOrder[]>;
  getCustomers(query?: string): Promise<CustomerSummary[]>;
  getDeliverySlots(): Promise<DeliverySlotSummary[]>;
  getDeliveryOrders(): Promise<DashboardOrder[]>;
  getSession(): Promise<MockSession>;
  setRole(role: Role): void;
  listOrders(query?: OrderListQuery): Promise<OrderListResult>;
  getOrder(orderId: string): Promise<MockOrderDetail | null>;
  getCreateOrderOptions(): Promise<CreateOrderOptions>;
  createOrder(
    input: CreateOrderInput,
    options?: OrderMutationOptions,
  ): Promise<MockOrderDetail>;
  applyOrderIntent(
    orderId: string,
    intent: MockOrderIntent,
    payload: unknown,
    baseVersion: number,
    options?: OrderMutationOptions,
  ): Promise<MockOrderDetail>;
  getDeliverySchedule(date?: string): Promise<DeliverySchedule>;
  listCustomers(query?: CustomerListQuery): Promise<CustomerListResult>;
  getCustomer(customerId: string): Promise<MockCustomerDetail | null>;
}

export interface MockApiOptions {
  latencyMs?: number;
  fail?: boolean;
  empty?: boolean;
  syncIssues?: boolean;
  role?: Role;
  today?: number;
  authRequired?: boolean;
}
