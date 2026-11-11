import { z } from "zod";
import { orderDetailSchema } from "./orders";

export const applyChangeIntentSchema = z.enum([
  "createOrder",
  "reschedule",
  "markProcessing",
  "placeOnHold",
  "releaseHold",
  "markOutForDelivery",
  "markDelivered",
  "cancel",
]);

export type ApplyChangeIntent = z.infer<typeof applyChangeIntentSchema>;

const applyChangeBaseSchema = z.object({
  orderId: z.string().min(1).max(128),
  mutationId: z.string().min(1).max(128),
});

const createOrderItemSchema = z
  .object({
    description: z.string().min(1).max(500),
    quantity: z.number().int().positive().max(100),
    serviceType: z.string().min(1).max(100).nullable().optional(),
  })
  .strict();

export type CreateOrderItemInput = z.infer<typeof createOrderItemSchema>;

export const createOrderPayloadSchema = z
  .object({
    customerId: z.string().min(1).max(128),
    serviceType: z.string().min(1).max(100),
    deliverySlotId: z.string().min(1).max(128),
    items: z.array(createOrderItemSchema).min(1).max(100),
  })
  .strict();

export const reschedulePayloadSchema = z
  .object({
    deliverySlotId: z.string().min(1).max(128),
  })
  .strict();

const emptyPayloadSchema = z.object({}).strict();

export const holdPayloadSchema = z
  .object({
    comments: z.string().trim().min(1).max(500),
  })
  .strict();

export const cancelPayloadSchema = z
  .object({
    reason: z.string().min(1).max(500).optional(),
  })
  .strict();

export const applyChangeInputSchema = z.discriminatedUnion("intent", [
  applyChangeBaseSchema.extend({
    intent: z.literal("createOrder"),
    payload: createOrderPayloadSchema,
    baseVersion: z.null(),
  }),
  applyChangeBaseSchema.extend({
    intent: z.literal("reschedule"),
    payload: reschedulePayloadSchema,
    baseVersion: z.number().int().nonnegative(),
  }),
  applyChangeBaseSchema.extend({
    intent: z.literal("markProcessing"),
    payload: emptyPayloadSchema,
    baseVersion: z.number().int().nonnegative(),
  }),
  applyChangeBaseSchema.extend({
    intent: z.literal("placeOnHold"),
    payload: holdPayloadSchema,
    baseVersion: z.number().int().nonnegative(),
  }),
  applyChangeBaseSchema.extend({
    intent: z.literal("releaseHold"),
    payload: emptyPayloadSchema,
    baseVersion: z.number().int().nonnegative(),
  }),
  applyChangeBaseSchema.extend({
    intent: z.literal("markOutForDelivery"),
    payload: emptyPayloadSchema,
    baseVersion: z.number().int().nonnegative(),
  }),
  applyChangeBaseSchema.extend({
    intent: z.literal("markDelivered"),
    payload: emptyPayloadSchema,
    baseVersion: z.number().int().nonnegative(),
  }),
  applyChangeBaseSchema.extend({
    intent: z.literal("cancel"),
    payload: cancelPayloadSchema,
    baseVersion: z.number().int().nonnegative(),
  }),
]);

export type ApplyChangeInput = z.infer<typeof applyChangeInputSchema>;

export const applyChangeResultSchema = z.object({
  order: orderDetailSchema,
  replayed: z.boolean(),
});

export type ApplyChangeResult = z.infer<typeof applyChangeResultSchema>;
