export const CURRENCY_INR = "INR" as const;
export const BUSINESS_TIMEZONE = "Asia/Kolkata" as const;
export const DEFAULT_BRANCH_CODE = "MAIN" as const;

export const STORAGE_ALERT_THRESHOLDS = {
  REVIEW_PERCENT: 60,
  PREPARE_ARCHIVE_PERCENT: 75,
  ACTION_REQUIRED_PERCENT: 85,
} as const;

export const PRICING_BASES = ["per_item", "per_kg"] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

export const TAX_SUPPLY_TYPES = ["intra_state", "inter_state", "exempt"] as const;
export type TaxSupplyType = (typeof TAX_SUPPLY_TYPES)[number];

export const ORDER_STATUSES = [
  "draft",
  "confirmed",
  "pickup_scheduled",
  "picked_up",
  "received",
  "processing",
  "ready",
  "out_for_delivery",
  "delivered",
  "hold",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_ADJUSTMENT_TYPES = [
  "discount",
  "surcharge",
  "express_fee",
  "delivery_fee",
  "rounding",
] as const;
export type OrderAdjustmentType = (typeof ORDER_ADJUSTMENT_TYPES)[number];

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = [
  "cash",
  "upi",
  "card",
  "bank_transfer",
  "online_gateway",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "authorized",
  "captured",
  "failed",
  "refunded",
  "partially_refunded",
  "cancelled",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_TXN_STATUSES = [
  "initiated",
  "pending",
  "succeeded",
  "failed",
  "reversed",
] as const;
export type PaymentTransactionStatus = (typeof PAYMENT_TXN_STATUSES)[number];

export const REFUND_STATUSES = [
  "pending",
  "processed",
  "failed",
  "cancelled",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const DELIVERY_TYPES = ["pickup", "delivery"] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export const DELIVERY_STATUSES = [
  "scheduled",
  "dispatched",
  "in_transit",
  "completed",
  "failed",
  "rescheduled",
  "cancelled",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const ADDRESS_TYPES = ["home", "office", "pickup", "delivery", "other"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

export const ROLE_CODES = [
  "super_admin",
  "admin",
  "manager",
  "front_desk",
  "service",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];
