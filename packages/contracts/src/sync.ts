import { z } from 'zod';

export const syncEntitySchema = z.enum([
  'tenant',
  'branch',
  'customer',
  'service',
  'order',
  'orderItem',
  'payment',
  'device',
]);

export type SyncEntity = z.infer<typeof syncEntitySchema>;

export const syncActionSchema = z.enum([
  'create',
  'update',
  'delete',
  'status_change',
  'payment',
]);

export type SyncAction = z.infer<typeof syncActionSchema>;

export const syncPushOperationSchema = z.object({
  operationId: z.string().min(1),
  deviceId: z.string().min(1),
  entity: syncEntitySchema,
  entityId: z.string().min(1),
  action: syncActionSchema,
  payload: z.record(z.string(), z.unknown()),
  baseVersion: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
});

export type SyncPushOperation = z.infer<typeof syncPushOperationSchema>;

export const syncPushRequestSchema = z.object({
  operations: z.array(syncPushOperationSchema).min(1).max(100),
});

export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncConflictItemSchema = z.object({
  operationId: z.string().min(1),
  entity: syncEntitySchema,
  entityId: z.string().min(1),
  baseVersion: z.number().int().nonnegative(),
  serverVersion: z.number().int().nonnegative(),
  serverPayload: z.record(z.string(), z.unknown()),
  message: z.string().optional(),
});

export type SyncConflictItem = z.infer<typeof syncConflictItemSchema>;

export const syncErrorItemSchema = z.object({
  operationId: z.string().min(1),
  error: z.string(),
  canRetry: z.boolean(),
});

export type SyncErrorItem = z.infer<typeof syncErrorItemSchema>;

export const syncPushResponseSchema = z.object({
  acknowledged: z.array(z.string()),
  conflicts: z.array(syncConflictItemSchema).default([]),
  errors: z.array(syncErrorItemSchema).default([]),
});

export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

export const syncPullQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().default(0),
  dataset: z.string().optional(),
  branchId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;

export const syncChangeItemSchema = z.object({
  cursor: z.number().int().positive(),
  entity: syncEntitySchema,
  entityId: z.string().min(1),
  branchId: z.string().nullable(),
  version: z.number().int().positive(),
  op: z.enum(['insert', 'update', 'delete']),
  payload: z.record(z.string(), z.unknown()),
  changedAt: z.number().int(),
});

export type SyncChangeItem = z.infer<typeof syncChangeItemSchema>;

export const syncPullResponseSchema = z.object({
  changes: z.array(syncChangeItemSchema),
  nextCursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

export const syncStatusResponseSchema = z.object({
  status: z.literal('ok'),
  tenantId: z.string(),
  latestCursor: z.number().int().nonnegative(),
  serverTime: z.number().int(),
  activeDevices: z.number().int().nonnegative(),
});

export type SyncStatusResponse = z.infer<typeof syncStatusResponseSchema>;

export const replicationPolicyItemSchema = z.object({
  dataset: z.string(),
  filterRule: z.string(),
  maxHistoryDays: z.number().nullable(),
});

export const syncPolicyResponseSchema = z.object({
  tenantId: z.string(),
  role: z.string(),
  policies: z.array(replicationPolicyItemSchema),
});

export type SyncPolicyResponse = z.infer<typeof syncPolicyResponseSchema>;

export const registerDeviceRequestSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().min(1),
  platform: z.string().default('web'),
  branchId: z.string().nullable().optional(),
});

export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

export const registerDeviceResponseSchema = z.object({
  success: z.boolean(),
  deviceId: z.string(),
  registeredAt: z.number(),
});

export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;

export const syncResolveRequestSchema = z.object({
  conflictId: z.string().min(1),
  entity: syncEntitySchema,
  entityId: z.string().min(1),
  resolution: z.enum(['keep_local', 'accept_server', 'custom']),
  customPayload: z.record(z.string(), z.unknown()).optional(),
});

export type SyncResolveRequest = z.infer<typeof syncResolveRequestSchema>;

export const syncResolveResponseSchema = z.object({
  resolved: z.boolean(),
  entityId: z.string(),
  newVersion: z.number().int().positive(),
});

export type SyncResolveResponse = z.infer<typeof syncResolveResponseSchema>;

export const realtimeNotificationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CHANGES_AVAILABLE'),
    tenantId: z.string(),
    branchId: z.string().nullable().optional(),
    entity: syncEntitySchema.optional(),
    latestCursor: z.number().int().nonnegative(),
    timestamp: z.number().int(),
  }),
  z.object({
    type: z.literal('DEVICE_REVOKED'),
    tenantId: z.string(),
    deviceId: z.string(),
    timestamp: z.number().int(),
  }),
  z.object({
    type: z.literal('PING'),
    timestamp: z.number().int(),
  }),
  z.object({
    type: z.literal('PONG'),
    timestamp: z.number().int(),
  }),
]);

export type RealtimeNotification = z.infer<typeof realtimeNotificationSchema>;

export const realtimeClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PING'),
  }),
  z.object({
    type: z.literal('SUBSCRIBE_BRANCH'),
    branchId: z.string(),
  }),
]);

export type RealtimeClientMessage = z.infer<typeof realtimeClientMessageSchema>;


