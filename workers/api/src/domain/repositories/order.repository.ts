import type {
  OrderAdjustmentType,
  OrderStatus,
  PricingBasis,
  TaxSupplyType,
} from "../../shared/constants";
import type { CursorPage, CursorPayload } from "../../shared/pagination";
import type { CalendarEventResult } from "../ports/calendar.port";

export interface OrderRecord {
  id: number;
  tenantId: number;
  branchId: number;
  customerId: number;
  rateCardId: number;
  pickupAddressId: number | null;
  deliveryAddressId: number | null;
  orderNumber: string;
  status: OrderStatus;
  currency: string;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
  taxSupplyType: TaxSupplyType;
  subtotalPaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  adjustmentsPaise: number;
  totalAmountPaise: number;
  promisedDeliveryAt: string | null;
  specialInstructions: string | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  customerName?: string;
  customerPhone?: string;
  primaryService?: string;
}

export interface OrderItemRecord {
  id: number;
  orderId: number;
  serviceId: number;
  itemId: number | null;
  taxRateId: number;
  serviceNameSnapshot: string;
  itemNameSnapshot: string | null;
  hsnSacCodeSnapshot: string;
  pricingBasis: PricingBasis;
  quantityPieces: number | null;
  weightGrams: number | null;
  unitPricePaise: number;
  grossAmountPaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  taxRateBps: number;
  cgstRateBps: number;
  sgstRateBps: number;
  igstRateBps: number;
  cgstAmountPaise: number;
  sgstAmountPaise: number;
  igstAmountPaise: number;
  totalTaxPaise: number;
  lineTotalPaise: number;
  notes: string | null;
  createdAt: string;
}

export interface OrderStatusHistoryRecord {
  id: number;
  orderId: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  reason: string | null;
  changedByUserId: number | null;
  createdAt: string;
}

export interface OrderNoteRecord {
  id: number;
  orderId: number;
  note: string;
  isInternal: boolean;
  createdByUserId: number | null;
  createdAt: string;
}

export interface OrderAdjustmentRecord {
  id: number;
  orderId: number;
  adjustmentType: OrderAdjustmentType;
  description: string;
  amountPaise: number;
  createdByUserId: number | null;
  createdAt: string;
}

export interface OrderWithDetails {
  order: OrderRecord;
  items: OrderItemRecord[];
  statusHistory: OrderStatusHistoryRecord[];
  notes: OrderNoteRecord[];
  adjustments: OrderAdjustmentRecord[];
  calendarEvent?: CalendarEventResult | null;
}

export interface CreateOrderAggregateInput {
  order: Omit<OrderRecord, "id">;
  items: Array<Omit<OrderItemRecord, "id" | "orderId">>;
  initialStatusReason?: string | null;
  changedByUserId?: number | null;
}

export interface OrderScope {
  tenantId?: number;
  branchId?: number;
}

export interface OrderRepository {
  createOrderAggregate(input: CreateOrderAggregateInput): Promise<OrderWithDetails>;
  findById(id: number, scope?: OrderScope): Promise<OrderRecord | null>;
  findWithDetails(id: number, scope?: OrderScope): Promise<OrderWithDetails | null>;
  list(params: {
    tenantId?: number;
    branchId?: number;
    customerId?: number;
    status?: OrderStatus;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<OrderRecord>>;
  transitionStatus(input: {
    orderId: number;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    reason?: string | null;
    changedByUserId?: number | null;
    nowIso: string;
  }): Promise<OrderRecord>;
  addNote(input: {
    orderId: number;
    note: string;
    isInternal: boolean;
    createdByUserId?: number | null;
    nowIso: string;
  }): Promise<OrderNoteRecord>;
  addAdjustment(input: {
    orderId: number;
    adjustmentType: OrderAdjustmentType;
    description: string;
    amountPaise: number;
    createdByUserId?: number | null;
    nowIso: string;
  }): Promise<{ adjustment: OrderAdjustmentRecord; order: OrderRecord }>;
  updateOrderLines(input: {
    orderId: number;
    items: Array<Omit<OrderItemRecord, "id" | "orderId">>;
    totals: {
      subtotalPaise: number;
      discountPaise: number;
      taxableAmountPaise: number;
      cgstPaise: number;
      sgstPaise: number;
      igstPaise: number;
      totalTaxPaise: number;
      totalAmountPaise: number;
    };
    specialInstructions?: string | null;
    promisedDeliveryAt?: string | null;
    changedByUserId?: number | null;
    nowIso: string;
  }): Promise<OrderWithDetails>;
}
