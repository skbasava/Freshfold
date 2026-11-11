import { z } from "zod";
import { orderDetailSchema } from "./orders";

export const changeOperationSchema = z.enum(["upsert", "delete"]);

export type ChangeOperation = z.infer<typeof changeOperationSchema>;

export const orderEventSchema = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  orderId: z.string().min(1),
  mutationId: z.string().min(1),
  eventType: z.string().min(1),
  source: z.enum(["app", "calendar", "system"]),
  actorType: z.enum(["user", "service", "system"]),
  actorId: z.string().nullable(),
  previousVersion: z.number().int().nonnegative(),
  newVersion: z.number().int().positive(),
  at: z.number().int(),
  detail: z.unknown(),
});

export type OrderEvent = z.infer<typeof orderEventSchema>;

export const orderEventsResponseSchema = z.object({
  items: z.array(orderEventSchema),
});

export type OrderEventsResponse = z.infer<typeof orderEventsResponseSchema>;

export const orderEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type OrderEventsQuery = z.infer<typeof orderEventsQuerySchema>;

const changeRecordBaseSchema = z.object({
  sequence: z.number().int().positive(),
  hubId: z.string().min(1),
  orderId: z.string().min(1),
  version: z.number().int().positive(),
  changedAt: z.number().int(),
});

export const changeRecordSchema = z.discriminatedUnion("operation", [
  changeRecordBaseSchema.extend({
    operation: z.literal("upsert"),
    order: orderDetailSchema,
  }),
  changeRecordBaseSchema.extend({
    operation: z.literal("delete"),
    order: z.null(),
  }),
]);

export type ChangeRecord = z.infer<typeof changeRecordSchema>;

export const changeFeedQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type ChangeFeedQuery = z.infer<typeof changeFeedQuerySchema>;

export const changeFeedResponseSchema = z.object({
  changes: z.array(changeRecordSchema),
  nextCursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type ChangeFeedResponse = z.infer<typeof changeFeedResponseSchema>;
