import { z } from "zod";

export const notificationChannelSchema = z.enum(["whatsapp", "sms"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationStateSchema = z.enum([
  "pending",
  "sending",
  "sent",
  "failed",
  "suppressed",
]);
export type NotificationState = z.infer<typeof notificationStateSchema>;

export const notificationOrderStateSchema = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  version: z.number().int().positive(),
  status: z.string().min(1),
  serviceType: z.string().min(1),
  deliveryAt: z.number().int().nullable(),
  lastNotifiedDeliveryAt: z.number().int().nullable(),
  customerName: z.string(),
  customerPhone: z.string().min(1),
});
export type NotificationOrderState = z.infer<
  typeof notificationOrderStateSchema
>;

export const notificationLedgerSchema = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  orderId: z.string().min(1),
  channel: notificationChannelSchema,
  destination: z.string().min(1),
  intendedAt: z.number().int(),
  idempotencyKey: z.string().min(1),
  state: notificationStateSchema,
  providerMessageId: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type NotificationLedger = z.infer<typeof notificationLedgerSchema>;

export const notificationClaimRequestSchema = z
  .object({
    outboxId: z.string().min(1),
    orderId: z.string().min(1),
    targetVersion: z.number().int().positive(),
    channel: notificationChannelSchema,
    delaySeconds: z.number().int().nonnegative().max(86_400).optional(),
    now: z.number().int().nonnegative().optional(),
  })
  .strict();
export type NotificationClaimRequest = z.infer<
  typeof notificationClaimRequestSchema
>;

export const notificationClaimOutcomeSchema = z.enum([
  "claimed",
  "not_due",
  "already_sent",
  "in_progress",
  "failed",
  "suppressed",
  "order_missing",
  "not_eligible",
]);
export type NotificationClaimOutcome = z.infer<
  typeof notificationClaimOutcomeSchema
>;

export const notificationClaimResponseSchema = z.object({
  outcome: notificationClaimOutcomeSchema,
  intendedAt: z.number().int().nullable(),
  notification: notificationLedgerSchema.nullable(),
});
export type NotificationClaimResponse = z.infer<
  typeof notificationClaimResponseSchema
>;

export const notificationSuppressionReasonSchema = z.enum([
  "superseded",
  "duplicate_delivery",
]);
export type NotificationSuppressionReason = z.infer<
  typeof notificationSuppressionReasonSchema
>;

export const notificationSuppressRequestSchema = z
  .object({
    outboxId: z.string().min(1),
    orderId: z.string().min(1),
    targetVersion: z.number().int().positive(),
    channel: notificationChannelSchema,
    reason: notificationSuppressionReasonSchema,
    intendedAt: z.number().int().positive().optional(),
    now: z.number().int().nonnegative().optional(),
  })
  .strict();
export type NotificationSuppressRequest = z.infer<
  typeof notificationSuppressRequestSchema
>;

export const notificationSuppressResponseSchema = z.object({
  suppressed: z.boolean(),
  notification: notificationLedgerSchema.nullable(),
});
export type NotificationSuppressResponse = z.infer<
  typeof notificationSuppressResponseSchema
>;

export const notificationOutcomeSchema = z.enum([
  "sent",
  "retry",
  "failed",
  "uncertain",
]);
export type NotificationOutcome = z.infer<typeof notificationOutcomeSchema>;

export const notificationSafeErrorCodeSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_.:-]+$/);

export const notificationOutcomeRequestSchema = z
  .object({
    notificationId: z.string().min(1),
    outboxId: z.string().min(1).optional(),
    targetVersion: z.number().int().positive(),
    outcome: notificationOutcomeSchema,
    providerMessageId: z.string().min(1).max(500).nullable().optional(),
    errorCode: notificationSafeErrorCodeSchema.nullable().optional(),
    now: z.number().int().nonnegative().optional(),
  })
  .strict();
export type NotificationOutcomeRequest = z.infer<
  typeof notificationOutcomeRequestSchema
>;

export const notificationOutcomeResponseSchema = z.object({
  recorded: z.boolean(),
  notification: notificationLedgerSchema.nullable(),
});
export type NotificationOutcomeResponse = z.infer<
  typeof notificationOutcomeResponseSchema
>;
