import { z } from "zod";

export const outboxQueueMessageSchema = z.object({
  outboxId: z.string().min(1),
  hubId: z.string().min(1),
  orderId: z.string().min(1),
  destination: z.enum(["calendar", "notification"]),
  operation: z.string().min(1),
  targetVersion: z.number().int().positive(),
  mutationId: z.string().min(1),
});

export type OutboxQueueMessage = z.infer<typeof outboxQueueMessageSchema>;

export const calendarQueueMessageSchema = outboxQueueMessageSchema.extend({
  destination: z.literal("calendar"),
});

export type CalendarQueueMessage = z.infer<typeof calendarQueueMessageSchema>;

export const notificationQueueMessageSchema = outboxQueueMessageSchema.extend({
  destination: z.literal("notification"),
});

export type NotificationQueueMessage = z.infer<
  typeof notificationQueueMessageSchema
>;

export const queueOrderStateSchema = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  version: z.number().int().positive(),
  status: z.string().min(1),
});

export type QueueOrderState = z.infer<typeof queueOrderStateSchema>;

export const outboxSweepRequestSchema = z
  .object({
    now: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const outboxSweepResponseSchema = z.object({
  claimed: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export type OutboxSweepRequest = z.infer<typeof outboxSweepRequestSchema>;
export type OutboxSweepResponse = z.infer<typeof outboxSweepResponseSchema>;

export const failedOutboxItemSchema = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  orderId: z.string().min(1),
  destination: z.enum(["calendar", "notification"]),
  operation: z.string().min(1),
  targetVersion: z.number().int().positive(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  createdAt: z.number().int(),
  completedAt: z.number().int().nullable(),
});

export type FailedOutboxItem = z.infer<typeof failedOutboxItemSchema>;

export const failedOutboxListResponseSchema = z.object({
  items: z.array(failedOutboxItemSchema),
  total: z.number().int().nonnegative(),
});

export type FailedOutboxListResponse = z.infer<
  typeof failedOutboxListResponseSchema
>;

export const outboxReplayRequestSchema = z
  .object({
    outboxId: z.string().min(1),
    now: z.number().int().nonnegative().optional(),
  })
  .strict();

export type OutboxReplayRequest = z.infer<typeof outboxReplayRequestSchema>;

export const outboxReplayResponseSchema = z.object({
  replayed: z.boolean(),
});

export type OutboxReplayResponse = z.infer<typeof outboxReplayResponseSchema>;

export const outboxHealthResponseSchema = z.object({
  pending: z.number().int().nonnegative(),
  dispatching: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  oldestPendingAt: z.number().int().nonnegative().nullable(),
  oldestPendingAgeSeconds: z.number().int().nonnegative(),
  checkedAt: z.number().int().nonnegative(),
});

export type OutboxHealthResponse = z.infer<typeof outboxHealthResponseSchema>;
