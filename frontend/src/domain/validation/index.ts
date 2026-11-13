import { z } from 'zod';

export const tenantRoleSchema = z.enum([
  'owner',
  'manager',
  'counter_staff',
  'operator',
  'finance',
]);

export const tenantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const branchSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nullable(),
});

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const tenantMembershipSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  role: tenantRoleSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const customerSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  branchId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().nullable(),
  notes: z.string().nullable(),
  version: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nullable(),
});

export const pricingUnitSchema = z.enum(['piece', 'kg', 'item', 'flat']);

export const serviceSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  pricingUnit: pricingUnitSchema,
  unitPriceMinor: z.number().int().nonnegative(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nullable(),
});

export const orderStatusSchema = z.enum([
  'received',
  'inspection',
  'washing',
  'drying',
  'ironing',
  'quality_check',
  'ready',
  'delivered',
  'cancelled',
]);

export const paymentStatusSchema = z.enum([
  'unpaid',
  'partially_paid',
  'paid',
  'refunded',
]);

export const orderSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  orderNumber: z.string().min(1),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  subtotalMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  receivedAt: z.number().int().nonnegative(),
  promisedAt: z.number().int().nullable(),
  deliveredAt: z.number().int().nullable(),
  version: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nullable(),
});

export const orderItemSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  serviceId: z.string().min(1),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
  lineTotalMinor: z.number().int().nonnegative(),
  garmentAttributes: z.record(z.string(), z.unknown()).nullable(),
  version: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nullable(),
});

export const paymentMethodSchema = z.enum([
  'cash',
  'UPI',
  'card',
  'bank transfer',
  'other',
]);

export const paymentTxStatusSchema = z.enum([
  'pending',
  'confirmed',
  'failed',
  'refunded',
]);

export const paymentSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  method: paymentMethodSchema,
  status: paymentTxStatusSchema,
  providerReference: z.string().nullable(),
  idempotencyKey: z.string().min(1),
  recordedAt: z.number().int().nonnegative(),
  confirmedAt: z.number().int().nullable(),
  createdAt: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

export const outboxEntitySchema = z.enum([
  'tenant',
  'branch',
  'customer',
  'service',
  'order',
  'orderItem',
  'payment',
  'device',
]);

export const outboxActionSchema = z.enum([
  'create',
  'update',
  'delete',
  'status_change',
  'payment',
]);

export const outboxStatusSchema = z.enum(['pending', 'in_flight', 'failed']);

export const outboxOperationSchema = z.object({
  operationId: z.string().min(1),
  tenantId: z.string().min(1),
  deviceId: z.string().min(1),
  entity: outboxEntitySchema,
  entityId: z.string().min(1),
  action: outboxActionSchema,
  payload: z.record(z.string(), z.unknown()),
  baseVersion: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  status: outboxStatusSchema,
  lastError: z.string().nullable(),
});

export const deviceRegistrationSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  branchId: z.string().nullable(),
  deviceName: z.string().min(1),
  platform: z.string().min(1),
  isRevoked: z.boolean(),
  lastSeenAt: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

// Allowed Order Lifecycle Transitions
export const ALLOWED_ORDER_TRANSITIONS: Record<string, string[]> = {
  received: ['inspection', 'cancelled'],
  inspection: ['washing', 'cancelled'],
  washing: ['drying', 'cancelled'],
  drying: ['ironing', 'cancelled'],
  ironing: ['quality_check', 'cancelled'],
  quality_check: ['ready', 'washing', 'cancelled'], // can rewash on defect
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export function isValidOrderStatusTransition(
  current: string,
  target: string,
): boolean {
  if (current === target) return true;
  const allowed = ALLOWED_ORDER_TRANSITIONS[current] ?? [];
  return allowed.includes(target);
}

