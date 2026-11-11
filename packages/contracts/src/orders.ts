import { z } from "zod";

export const orderStatusSchema = z.enum([
  "confirmed",
  "processing",
  "hold",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const customerSchema = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  name: z.string(),
  phone: z.string(),
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type Customer = z.infer<typeof customerSchema>;

export const customerListResponseSchema = z.object({
  items: z.array(customerSchema),
  nextCursor: z.string().nullable(),
});

export type CustomerListResponse = z.infer<typeof customerListResponseSchema>;

export const orderItemSchema = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  orderId: z.string().min(1),
  description: z.string(),
  quantity: z.number().int().positive(),
  serviceType: z.string().nullable(),
  createdAt: z.number().int(),
});

export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderSummarySchema = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  customerId: z.string().min(1),
  customerName: z.string(),
  customerPhone: z.string(),
  status: orderStatusSchema,
  serviceType: z.string(),
  deliverySlotId: z.string().nullable(),
  deliveryAt: z.number().int().nullable(),
  version: z.number().int().positive(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  cancelledAt: z.number().int().nullable(),
  holdComment: z.string().nullable(),
});

export type OrderSummary = z.infer<typeof orderSummarySchema>;

export const orderDetailSchema = orderSummarySchema.extend({
  customer: customerSchema,
  items: z.array(orderItemSchema),
});

export type OrderDetail = z.infer<typeof orderDetailSchema>;

export const orderListResponseSchema = z.object({
  items: z.array(orderSummarySchema),
  nextCursor: z.string().nullable(),
});

export type OrderListResponse = z.infer<typeof orderListResponseSchema>;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
