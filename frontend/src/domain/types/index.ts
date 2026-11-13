export type TenantRole =
  | 'owner'
  | 'manager'
  | 'counter_staff'
  | 'operator'
  | 'finance';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
  updatedAt: number;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  address: string;
  isActive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
  updatedAt: number;
}

export interface TenantMembership {
  tenantId: string;
  userId: string;
  role: TenantRole;
  createdAt: number;
  updatedAt: number;
}

export interface Customer {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type PricingUnit = 'piece' | 'kg' | 'item' | 'flat';

export interface Service {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  pricingUnit: PricingUnit;
  unitPriceMinor: number;
  isActive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type OrderStatus =
  | 'received'
  | 'inspection'
  | 'washing'
  | 'drying'
  | 'ironing'
  | 'quality_check'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus =
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'refunded';

export interface Order {
  id: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  notes: string | null;
  receivedAt: number;
  promisedAt: number | null;
  deliveredAt: number | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type GarmentAttributes = Record<string, unknown> | null;

export interface OrderItem {
  id: string;
  tenantId: string;
  orderId: string;
  serviceId: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  garmentAttributes: GarmentAttributes;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type PaymentMethod =
  | 'cash'
  | 'UPI'
  | 'card'
  | 'bank transfer'
  | 'other';

export type PaymentTxStatus =
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'refunded';

export interface Payment {
  id: string;
  tenantId: string;
  orderId: string;
  amountMinor: number;
  method: PaymentMethod;
  status: PaymentTxStatus;
  providerReference: string | null;
  idempotencyKey: string;
  recordedAt: number;
  confirmedAt: number | null;
  createdAt: number;
  version: number;
}

export interface DeviceRegistration {
  id: string;
  tenantId: string;
  userId: string;
  branchId: string | null;
  deviceName: string;
  platform: string;
  isRevoked: boolean;
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
}

export type OutboxEntity =
  | 'tenant'
  | 'branch'
  | 'customer'
  | 'service'
  | 'order'
  | 'orderItem'
  | 'payment'
  | 'device';

export type OutboxAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'payment';

export type OutboxStatus = 'pending' | 'in_flight' | 'failed';

export interface OutboxOperation<TPayload = Record<string, unknown>> {
  operationId: string;
  tenantId: string;
  deviceId: string;
  entity: OutboxEntity;
  entityId: string;
  action: OutboxAction;
  payload: TPayload;
  baseVersion: number;
  createdAt: number;
  retryCount: number;
  status: OutboxStatus;
  lastError: string | null;
}

export type SyncDataset =
  | 'customers'
  | 'branches'
  | 'services'
  | 'orders'
  | 'orderItems'
  | 'payments'
  | 'devices';

export type SyncStateStatus = 'idle' | 'syncing' | 'error';

export interface SyncStateRecord {
  id: string; // `${tenantId}:${dataset}`
  tenantId: string;
  dataset: string;
  lastCursor: number;
  lastSyncAt: number;
  status: SyncStateStatus;
  lastError: string | null;
}

export interface SyncConflictRecord {
  id: string;
  tenantId: string;
  entity: OutboxEntity;
  entityId: string;
  operationId: string;
  baseVersion: number;
  serverVersion: number;
  localPayload: Record<string, unknown>;
  serverPayload: Record<string, unknown>;
  resolved: boolean;
  resolvedAt: number | null;
  resolution: 'keep_local' | 'accept_server' | 'custom' | null;
  createdAt: number;
}

