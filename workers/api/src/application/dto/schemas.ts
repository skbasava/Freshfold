import { z } from "zod";
import {
  ADDRESS_TYPES,
  DELIVERY_STATUSES,
  DELIVERY_TYPES,
  ORDER_ADJUSTMENT_TYPES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PRICING_BASES,
} from "../../shared/constants";

const isoDateTime = z.string().datetime({ offset: true });
const stateCode = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]{2}$/, "State code must be a 2-character GST state code");

export const cursorQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});

/* ---------------- Customer DTOs ---------------- */

export const createCustomerSchema = z.object({
  customerCode: z.string().trim().min(2).max(40).optional(),
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().max(160).nullable().optional(),
  gstin: z.string().trim().min(15).max(15).nullable().optional(),
  stateCode: stateCode.nullable().optional(),
});

export const updateCustomerSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  email: z.string().trim().email().max(160).nullable().optional(),
  gstin: z.string().trim().min(15).max(15).nullable().optional(),
  stateCode: stateCode.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createCustomerAddressSchema = z.object({
  addressType: z.enum(ADDRESS_TYPES).default("home"),
  label: z.string().trim().max(60).nullable().optional(),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullable().optional(),
  landmark: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  stateCode,
  postalCode: z.string().trim().min(4).max(12),
  isDefaultPickup: z.boolean().optional(),
  isDefaultDelivery: z.boolean().optional(),
});

export const upsertCustomerPreferencesSchema = z.object({
  detergentPreference: z.string().trim().max(80).nullable().optional(),
  starchLevel: z.string().trim().max(40).nullable().optional(),
  foldOrHanger: z.string().trim().max(40).nullable().optional(),
  fragranceFree: z.boolean().optional(),
  specialInstructions: z.string().trim().max(500).nullable().optional(),
});

/* ---------------- Catalog DTOs ---------------- */

export const createCategorySchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(400).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const createItemSchema = z.object({
  categoryId: z.number().int().positive(),
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).nullable().optional(),
  hsnSacCode: z.string().trim().min(4).max(12).nullable().optional(),
});

export const updateItemSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  hsnSacCode: z.string().trim().min(4).max(12).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const setItemAttributeSchema = z.object({
  attributeKey: z.string().trim().min(1).max(60),
  attributeValue: z.string().trim().min(1).max(160),
});

export const createServiceSchema = z.object({
  categoryId: z.number().int().positive(),
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).nullable().optional(),
  defaultPricingBasis: z.enum(PRICING_BASES),
  defaultTaxRateId: z.number().int().positive().nullable().optional(),
  turnaroundHours: z.number().int().positive().max(720).default(48),
});

/* ---------------- Pricing & GST DTOs ---------------- */

export const createTaxRateSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(1).max(120),
  hsnSacCode: z.string().trim().min(4).max(12),
  totalRateBps: z.number().int().min(0).max(10000),
  cgstRateBps: z.number().int().min(0).max(10000),
  sgstRateBps: z.number().int().min(0).max(10000),
  igstRateBps: z.number().int().min(0).max(10000),
  isExempt: z.boolean().default(false),
  effectiveFrom: isoDateTime,
  effectiveTo: isoDateTime.nullable().optional(),
});

export const createRateCardSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).nullable().optional(),
  isDefault: z.boolean().default(false),
  effectiveFrom: isoDateTime,
  effectiveTo: isoDateTime.nullable().optional(),
});

export const addRateCardItemSchema = z.object({
  serviceId: z.number().int().positive(),
  itemId: z.number().int().positive().nullable().optional(),
  taxRateId: z.number().int().positive(),
  pricingBasis: z.enum(PRICING_BASES),
  unitPricePaise: z.number().int().min(0),
  minQuantity: z.number().int().positive().nullable().optional(),
  effectiveFrom: isoDateTime,
  effectiveTo: isoDateTime.nullable().optional(),
});

export const assignCustomerRateCardSchema = z.object({
  rateCardId: z.number().int().positive(),
  effectiveFrom: isoDateTime,
  effectiveTo: isoDateTime.nullable().optional(),
});

export const orderLineRequestSchema = z.object({
  serviceId: z.number().int().positive(),
  itemId: z.number().int().positive().nullable().optional(),
  pricingBasis: z.enum(PRICING_BASES),
  quantityPieces: z.number().int().positive().nullable().optional(),
  weightGrams: z.number().int().positive().nullable().optional(),
  discountPaise: z.number().int().min(0).default(0),
  notes: z.string().trim().max(300).nullable().optional(),
});

export const pricingQuoteSchema = z.object({
  customerId: z.number().int().positive(),
  rateCardId: z.number().int().positive().optional(),
  placeOfSupplyStateCode: stateCode.optional(),
  asOfIso: isoDateTime.optional(),
  lines: z.array(orderLineRequestSchema).min(1).max(100),
});

/* ---------------- Order DTOs ---------------- */

export const createOrderSchema = z.object({
  customerId: z.number().int().positive(),
  rateCardId: z.number().int().positive().optional(),
  pickupAddressId: z.number().int().positive().nullable().optional(),
  deliveryAddressId: z.number().int().positive().nullable().optional(),
  placeOfSupplyStateCode: stateCode.optional(),
  promisedDeliveryAt: isoDateTime.nullable().optional(),
  specialInstructions: z.string().trim().max(500).nullable().optional(),
  lines: z.array(orderLineRequestSchema).min(1).max(100),
});

export const updateOrderSchema = z.object({
  lines: z.array(orderLineRequestSchema).min(1).max(100),
  promisedDeliveryAt: isoDateTime.nullable().optional(),
  specialInstructions: z.string().trim().max(500).nullable().optional(),
});

export const transitionOrderStatusSchema = z.object({
  toStatus: z.enum(ORDER_STATUSES),
  reason: z.string().trim().max(300).nullable().optional(),
});

export const addOrderNoteSchema = z.object({
  note: z.string().trim().min(1).max(1000),
  isInternal: z.boolean().default(true),
});

export const addOrderAdjustmentSchema = z.object({
  adjustmentType: z.enum(ORDER_ADJUSTMENT_TYPES),
  description: z.string().trim().min(1).max(200),
  amountPaise: z.number().int(),
});

/* ---------------- Billing & Payment DTOs ---------------- */

export const createInvoiceSchema = z.object({
  /** Optional subset of order_item IDs for partial billing; omits to bill all items */
  orderItemIds: z.array(z.number().int().positive()).min(1).optional(),
  issueImmediately: z.boolean().default(true),
  dueAt: isoDateTime.nullable().optional(),
});

export const createPaymentSchema = z.object({
  customerId: z.number().int().positive(),
  orderId: z.number().int().positive().nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  amountPaise: z.number().int().positive(),
  /** True only for verified counter methods (cash/upi/card) where settlement is immediate */
  captureImmediately: z.boolean().default(false),
  provider: z.string().trim().max(40).nullable().optional(),
  providerReference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.number().int().positive(),
        amountPaise: z.number().int().positive(),
      }),
    )
    .optional(),
});

export const allocatePaymentSchema = z.object({
  invoiceId: z.number().int().positive(),
  amountPaise: z.number().int().positive(),
});

export const createRefundSchema = z.object({
  invoiceId: z.number().int().positive().nullable().optional(),
  amountPaise: z.number().int().positive(),
  reason: z.string().trim().min(2).max(300),
  providerRefundReference: z.string().trim().max(120).nullable().optional(),
});

export const paymentWebhookSchema = z.object({
  provider: z.string().trim().min(1).max(40),
  providerReference: z.string().trim().min(1).max(120),
  providerEventId: z.string().trim().min(1).max(120),
  eventType: z.enum(["payment.captured", "payment.failed", "payment.authorized"]),
  amountPaise: z.number().int().positive(),
  failureCode: z.string().trim().max(80).nullable().optional(),
  failureMessage: z.string().trim().max(300).nullable().optional(),
});

/* ---------------- Delivery DTOs ---------------- */

export const createDeliverySchema = z.object({
  deliveryType: z.enum(DELIVERY_TYPES),
  customerAddressId: z.number().int().positive().nullable().optional(),
  addressSnapshot: z
    .object({
      line1: z.string().trim().min(1).max(200),
      line2: z.string().trim().max(200).nullable().optional(),
      landmark: z.string().trim().max(120).nullable().optional(),
      city: z.string().trim().min(1).max(80),
      state: z.string().trim().min(1).max(80),
      stateCode,
      postalCode: z.string().trim().min(4).max(12),
    })
    .optional(),
  contactName: z.string().trim().min(1).max(120).optional(),
  contactPhone: z.string().trim().min(7).max(20).optional(),
  scheduledAt: isoDateTime,
  windowStartAt: isoDateTime.nullable().optional(),
  windowEndAt: isoDateTime.nullable().optional(),
  notes: z.string().trim().max(400).nullable().optional(),
});

export const transitionDeliveryStatusSchema = z.object({
  toStatus: z.enum(DELIVERY_STATUSES),
  reason: z.string().trim().max(300).nullable().optional(),
  proofR2Key: z.string().trim().max(300).nullable().optional(),
});
