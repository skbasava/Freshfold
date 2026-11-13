export const DB_NAME = 'freshfold-laundry';
export const CURRENT_DB_VERSION = 2;

export const TABLE_NAMES = {
  TENANTS: 'tenants',
  BRANCHES: 'branches',
  CUSTOMERS: 'customers',
  SERVICES: 'services',
  ORDERS: 'orders',
  ORDER_ITEMS: 'orderItems',
  PAYMENTS: 'payments',
  OUTBOX: 'outbox',
  SYNC_STATE: 'syncState',
  CONFLICTS: 'conflicts',
  DEVICES: 'devices',
  // Legacy
  LEGACY_ORDERS: 'orders',
  LEGACY_MUTATIONS: 'mutations',
  LEGACY_META: 'meta',
} as const;

export const SCHEMA_V1 = {
  orders: 'id',
  mutations: 'mutationId, orderId',
  meta: 'key',
};

export const SCHEMA_V2 = {
  tenants: 'id, slug, createdAt',
  branches: 'id, tenantId, [tenantId+isActive], code, updatedAt',
  customers: 'id, tenantId, branchId, phone, [tenantId+branchId], updatedAt',
  services: 'id, tenantId, [tenantId+isActive], updatedAt',
  orders:
    'id, tenantId, branchId, customerId, status, paymentStatus, orderNumber, [tenantId+status], [tenantId+branchId+status], updatedAt, receivedAt',
  orderItems: 'id, tenantId, orderId, serviceId, updatedAt',
  payments: 'id, tenantId, orderId, idempotencyKey, status, recordedAt',
  outbox:
    'operationId, tenantId, status, [tenantId+status], entity, entityId, createdAt',
  syncState: 'id, tenantId, dataset, [tenantId+dataset]',
  conflicts: 'id, tenantId, operationId, entity, entityId, resolved, createdAt',
  devices: 'id, tenantId, userId, isRevoked',
  // Preserving legacy tables so upgrades don't drop data unexpectedly
  mutations: 'mutationId, orderId',
  meta: 'key',
};

