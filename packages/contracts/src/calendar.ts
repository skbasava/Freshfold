import { z } from "zod";
import { orderDetailSchema } from "./orders";

export const calendarSyncStatusSchema = z.enum([
  "pending",
  "synced",
  "error",
  "repairing",
]);

export type CalendarSyncStatus = z.infer<typeof calendarSyncStatusSchema>;

export const calendarSyncSchema = z.object({
  orderId: z.string().min(1),
  hubId: z.string().min(1),
  calendarId: z.string().min(1),
  eventId: z.string().min(1),
  etag: z.string().nullable(),
  syncedVersion: z.number().int().nonnegative(),
  syncStatus: calendarSyncStatusSchema,
  lastError: z.string().nullable(),
  lastProjectedAt: z.number().int().nullable(),
  updatedAt: z.number().int(),
});

export type CalendarSync = z.infer<typeof calendarSyncSchema>;

export const calendarOrderStateSchema = z.object({
  order: orderDetailSchema,
  calendarSync: calendarSyncSchema.nullable(),
});

export type CalendarOrderState = z.infer<typeof calendarOrderStateSchema>;

export const calendarOrderListResponseSchema = z.object({
  items: z.array(calendarOrderStateSchema),
  nextCursor: z.string().nullable(),
});

export type CalendarOrderListResponse = z.infer<
  typeof calendarOrderListResponseSchema
>;

export const calendarProjectionRequestSchema = z
  .object({
    calendarId: z.string().min(1).max(1024),
    eventId: z.string().min(1).max(1024),
    etag: z.string().min(1).max(1024).nullable(),
    syncedVersion: z.number().int().positive(),
    syncStatus: calendarSyncStatusSchema.optional(),
    lastError: z.string().max(500).nullable().optional(),
    now: z.number().int().nonnegative().optional(),
  })
  .strict();

export type CalendarProjectionRequest = z.infer<
  typeof calendarProjectionRequestSchema
>;

export const calendarProjectionResponseSchema = z.object({
  updated: z.boolean(),
  calendarSync: calendarSyncSchema.nullable(),
});

export type CalendarProjectionResponse = z.infer<
  typeof calendarProjectionResponseSchema
>;

export const calendarSyncStateSchema = z.object({
  calendarId: z.string().min(1),
  hubId: z.string().min(1),
  syncToken: z.string().nullable(),
  lastPolledAt: z.number().int().nullable(),
  lastFullSyncAt: z.number().int().nullable(),
  recoveryState: z.string().min(1),
  lastError: z.string().nullable(),
  updatedAt: z.number().int(),
});

export type CalendarSyncState = z.infer<typeof calendarSyncStateSchema>;

export const calendarSyncStatePutRequestSchema = z
  .object({
    hubId: z.string().min(1),
    syncToken: z.string().min(1).max(4096).nullable().optional(),
    lastPolledAt: z.number().int().nonnegative().nullable().optional(),
    lastFullSyncAt: z.number().int().nonnegative().nullable().optional(),
    recoveryState: z.string().min(1).max(64).optional(),
    lastError: z.string().max(500).nullable().optional(),
    now: z.number().int().nonnegative().optional(),
  })
  .strict();

export type CalendarSyncStatePutRequest = z.infer<
  typeof calendarSyncStatePutRequestSchema
>;

export const calendarSyncStateResponseSchema = z.object({
  state: calendarSyncStateSchema.nullable(),
});

export type CalendarSyncStateResponse = z.infer<
  typeof calendarSyncStateResponseSchema
>;

export const calendarRepairRequestSchema = z
  .object({
    hubId: z.string().min(1),
    orderId: z.string().min(1).nullable().optional(),
    calendarId: z.string().min(1).max(1024),
    eventId: z.string().min(1).max(1024).nullable().optional(),
    observedEtag: z.string().min(1).max(1024).nullable().optional(),
    action: z.string().min(1).max(100),
    outcome: z.string().min(1).max(100),
    detail: z.unknown().optional(),
    now: z.number().int().nonnegative().optional(),
  })
  .strict();

export type CalendarRepairRequest = z.infer<
  typeof calendarRepairRequestSchema
>;

export const calendarRepairSchema = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  orderId: z.string().nullable(),
  calendarId: z.string().min(1),
  eventId: z.string().nullable(),
  observedEtag: z.string().nullable(),
  action: z.string().min(1),
  outcome: z.string().min(1),
  detail: z.unknown(),
  createdAt: z.number().int(),
});

export type CalendarRepair = z.infer<typeof calendarRepairSchema>;

export const calendarRepairResponseSchema = z.object({
  repair: calendarRepairSchema,
});

export type CalendarRepairResponse = z.infer<
  typeof calendarRepairResponseSchema
>;

export const calendarRescheduleRequestSchema = z
  .object({
    orderId: z.string().min(1).max(128),
    eventId: z.string().min(1).max(1024),
    calendarId: z.string().min(1).max(1024),
    startAt: z.number().int().positive(),
    endAt: z.number().int().positive().optional(),
    baseVersion: z.number().int().nonnegative(),
    mutationId: z.string().min(1).max(128),
  })
  .strict();

export type CalendarRescheduleRequest = z.infer<
  typeof calendarRescheduleRequestSchema
>;

export const calendarRescheduleResponseSchema = z.object({
  order: orderDetailSchema,
  replayed: z.boolean(),
});

export type CalendarRescheduleResponse = z.infer<
  typeof calendarRescheduleResponseSchema
>;

export const calendarOutboxCompleteRequestSchema = z
  .object({
    outboxId: z.string().min(1),
    now: z.number().int().nonnegative().optional(),
  })
  .strict();

export type CalendarOutboxCompleteRequest = z.infer<
  typeof calendarOutboxCompleteRequestSchema
>;

export const calendarOutboxCompleteResponseSchema = z.object({
  completed: z.boolean(),
});

export type CalendarOutboxCompleteResponse = z.infer<
  typeof calendarOutboxCompleteResponseSchema
>;

export const calendarEnqueueUpsertRequestSchema = z
  .object({
    orderId: z.string().min(1).max(128),
    targetVersion: z.number().int().positive(),
    now: z.number().int().nonnegative().optional(),
  })
  .strict();

export type CalendarEnqueueUpsertRequest = z.infer<
  typeof calendarEnqueueUpsertRequestSchema
>;

export const calendarEnqueueUpsertResponseSchema = z.object({
  enqueued: z.boolean(),
});

export type CalendarEnqueueUpsertResponse = z.infer<
  typeof calendarEnqueueUpsertResponseSchema
>;
