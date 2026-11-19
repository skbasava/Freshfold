import type { OrderStatus } from "@laundry/contracts";

export interface OrderListItem {
  id: number;
  orderNumber: string;
  customerId: number;
  customerName: string;
  customerPhone?: string;
  primaryService: string;
  status: OrderStatus;
  totalAmountPaise: number;
  promisedDeliveryAt: string | null;
  specialInstructions: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemDetail {
  id: number;
  serviceId: number;
  itemId: number | null;
  serviceNameSnapshot: string;
  itemNameSnapshot: string | null;
  hsnSacCodeSnapshot: string;
  pricingBasis: "per_item" | "per_kg";
  quantityPieces: number | null;
  weightGrams: number | null;
  unitPricePaise: number;
  grossAmountPaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  taxRateBps: number;
  cgstAmountPaise: number;
  sgstAmountPaise: number;
  igstAmountPaise: number;
  totalTaxPaise: number;
  lineTotalPaise: number;
  notes: string | null;
}

export interface OrderStatusHistoryItem {
  id: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  reason: string | null;
  changedByUserId: number | null;
  createdAt: string;
}

export interface OrderNoteItem {
  id: number;
  note: string;
  isInternal: boolean;
  createdByUserId: number | null;
  createdAt: string;
}

export interface CalendarEventInfo {
  success: boolean;
  eventId?: string;
  htmlLink?: string;
  summary?: string;
  startIso?: string;
  endIso?: string;
  error?: string;
}

export interface OrderDetail {
  order: OrderListItem & {
    branchId: number;
    rateCardId: number;
    pickupAddressId: number | null;
    deliveryAddressId: number | null;
    currency: string;
    supplierStateCode: string;
    placeOfSupplyStateCode: string;
    taxSupplyType: "intra_state" | "inter_state" | "exempt";
    subtotalPaise: number;
    discountPaise: number;
    taxableAmountPaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    totalTaxPaise: number;
    adjustmentsPaise: number;
  };
  items: OrderItemDetail[];
  statusHistory: OrderStatusHistoryItem[];
  notes: OrderNoteItem[];
  adjustments: Array<{
    id: number;
    adjustmentType: string;
    description: string;
    amountPaise: number;
    createdAt: string;
  }>;
  calendarEvent?: CalendarEventInfo | null;
}

export interface CreateOrderLineInput {
  serviceId: number;
  itemId?: number | null;
  pricingBasis: "per_item" | "per_kg";
  quantityPieces?: number;
  weightGrams?: number;
  discountPaise?: number;
  notes?: string;
}

export interface CreateOrderPayload {
  customerId: number;
  deliveryAddressId?: number | null;
  promisedDeliveryAt?: string | null;
  specialInstructions?: string | null;
  lines: CreateOrderLineInput[];
}

export interface PricingQuoteResult {
  taxSupplyType?: "intra_state" | "inter_state" | "exempt";
  subtotalPaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  totalAmountPaise: number;
  lines: Array<{
    serviceNameSnapshot: string;
    itemNameSnapshot: string | null;
    hsnSacCodeSnapshot: string;
    grossAmountPaise: number;
    discountPaise: number;
    taxableAmountPaise: number;
    totalTaxPaise: number;
    lineTotalPaise: number;
  }>;
}

export type PaymentMethod =
  | "cash"
  | "upi"
  | "card"
  | "net_banking"
  | "wallet"
  | "online_gateway";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "partially_refunded"
  | "refunded"
  | "failed";

export interface PaymentItem {
  id: number;
  paymentNumber: string;
  customerId: number;
  orderId: number | null;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  amountPaise: number;
  capturedAmountPaise: number;
  refundedAmountPaise: number;
  currency: string;
  provider?: string | null;
  providerReference?: string | null;
  notes?: string | null;
  capturedAt?: string | null;
  createdAt: string;
}

export interface RefundItem {
  id: number;
  paymentId: number;
  invoiceId?: number | null;
  refundNumber: string;
  status: "processed" | "failed";
  amountPaise: number;
  reason: string;
  providerRefundReference?: string | null;
  processedAt?: string | null;
  createdAt: string;
}

export interface OrderBillingSummary {
  orderId: number;
  orderNumber: string;
  customerId: number;
  totalAmountPaise: number;
  capturedAmountPaise: number;
  refundedAmountPaise: number;
  netPaidAmountPaise: number;
  balanceDuePaise: number;
  paymentStatus: "paid" | "partially_paid" | "unpaid" | "refunded";
  payments: PaymentItem[];
  refunds: RefundItem[];
  invoices: any[];
}

export interface CustomerBillingSummary {
  customerId: number;
  totalOrdersCount: number;
  totalBilledPaise: number;
  capturedAmountPaise: number;
  refundedAmountPaise: number;
  netPaidAmountPaise: number;
  outstandingDuePaise: number;
  paymentStatus: "paid" | "has_due" | "clear";
}
