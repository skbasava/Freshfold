import type {
  CreateHubRequest,
  CreateTenantRequest,
  DeleteHubResponse,
  DeleteTenantResponse,
  Hub,
  HubListResponse,
  LoginRequest,
  OrderEventsResponse,
  OrderStateSnapshot,
  Role,
  Tenant,
  TenantListResponse,
  UpdateHubRequest,
  UpdateTenantRequest,
} from "@laundry/contracts";
import type {
  AttentionItem,
  CreateOrderInput,
  CreateOrderOptions,
  CustomerDetail,
  CustomerListQuery,
  CustomerListResult,
  CustomerSummary,
  DashboardData,
  DashboardOrder,
  DashboardSummary,
  DeliverySchedule,
  DeliverySlotSummary,
  OrderDetail,
  OrderIntent,
  OrderListQuery,
  OrderListResult,
  OrderMutationOptions,
  UpdateOrderInput,
  UserSession,
} from "../types";

export type ApiMode = "mock" | "live";

export type CapabilityState =
  | "available"
  | "unavailable"
  | "demo-fallback"
  | "order-scan-fallback"
  | "fallback";

export interface ApiCapabilities {
  mode: ApiMode;
  roleSwitch: boolean;
  deliverySlots: CapabilityState;
  customerWrite: CapabilityState;
  customerOrderHistory: CapabilityState;
  services: CapabilityState;
  liveReads: boolean;
}

export interface ApiClient {
  getDashboardData(): Promise<DashboardData>;
  getSummary(): Promise<DashboardSummary>;
  getAttentionItems(): Promise<AttentionItem[]>;
  getRecentOrders(limit?: number): Promise<DashboardOrder[]>;
  getCustomers(query?: string): Promise<CustomerSummary[]>;
  getDeliverySlots(): Promise<DeliverySlotSummary[]>;
  getDeliveryOrders(): Promise<DashboardOrder[]>;
  getSession(): Promise<UserSession>;
  setRole(role: Role): void;
  listOrders(query?: OrderListQuery): Promise<OrderListResult>;
  getOrder(orderId: string): Promise<OrderDetail | null>;
  getOrderState(orderId: string): Promise<OrderStateSnapshot | null>;
  getOrderEvents(orderId: string): Promise<OrderEventsResponse>;
  updateOrder(
    orderId: string,
    input: UpdateOrderInput,
    options?: OrderMutationOptions,
  ): Promise<OrderDetail>;
  cancelOrder(
    orderId: string,
    reason?: string,
    options?: OrderMutationOptions,
  ): Promise<OrderDetail>;
  getCreateOrderOptions(): Promise<CreateOrderOptions>;
  createOrder(
    input: CreateOrderInput,
    options?: OrderMutationOptions,
  ): Promise<OrderDetail>;
  applyOrderIntent(
    orderId: string,
    intent: OrderIntent,
    payload: unknown,
    baseVersion: number,
    options?: OrderMutationOptions,
  ): Promise<OrderDetail>;
  getDeliverySchedule(date?: string): Promise<DeliverySchedule>;
  listCustomers(query?: CustomerListQuery): Promise<CustomerListResult>;
  getCustomer(customerId: string): Promise<CustomerDetail | null>;
  listTenants(query?: {
    status?: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<TenantListResponse>;
  getTenant(id: string): Promise<Tenant | null>;
  createTenant(input: CreateTenantRequest): Promise<Tenant>;
  updateTenant(id: string, input: UpdateTenantRequest): Promise<Tenant>;
  deleteTenant(id: string): Promise<DeleteTenantResponse>;
  listHubs(query?: {
    tenantId?: string;
    isActive?: boolean;
    limit?: number;
    cursor?: string | null;
  }): Promise<HubListResponse>;
  getHub(id: string): Promise<Hub | null>;
  createHub(input: CreateHubRequest): Promise<Hub>;
  updateHub(id: string, input: UpdateHubRequest): Promise<Hub>;
  deleteHub(id: string): Promise<DeleteHubResponse>;
}

export interface AppApi extends ApiClient {
  readonly mode: ApiMode;
  readonly capabilities: ApiCapabilities;
  login(input: LoginRequest): Promise<UserSession>;
  logout(): Promise<void>;
  syncPendingMutations(): Promise<void>;
  getPendingCount(): Promise<number>;
  /**
   * Selects the employee/tenant/hub-scoped local cache. Implementations must
   * keep pending mutations for each account and expose only the active scope.
   */
  setAccountScope?(accountKey: string | null): Promise<void>;
}

export interface ApiConfig {
  mode: ApiMode;
  baseUrl: string;
  timeoutMs: number;
  demoFallbacks: boolean;
  requireAuth: boolean;
}
