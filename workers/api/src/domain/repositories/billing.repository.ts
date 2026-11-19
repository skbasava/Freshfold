import type {
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
  PricingBasis,
  RefundStatus,
  TaxSupplyType,
} from "../../shared/constants";
import type { CursorPage, CursorPayload } from "../../shared/pagination";

export interface InvoiceRecord {
  id: number;
  branchId: number;
  orderId: number;
  customerId: number;
  invoiceNumber: string;
  status: InvoiceStatus;
  currency: string;
  supplierNameSnapshot: string;
  supplierGstinSnapshot: string | null;
  supplierStateCode: string;
  customerNameSnapshot: string;
  customerGstinSnapshot: string | null;
  placeOfSupplyStateCode: string;
  taxSupplyType: TaxSupplyType;
  subtotalPaise: number;
  discountPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  totalAmountPaise: number;
  paidAmountPaise: number;
  balanceDuePaise: number;
  issuedAt: string | null;
  dueAt: string | null;
  pdfR2Key: string | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItemRecord {
  id: number;
  invoiceId: number;
  orderItemId: number | null;
  description: string;
  hsnSacCode: string;
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
  createdAt: string;
}

export interface PaymentRecord {
  id: number;
  branchId: number;
  customerId: number;
  orderId: number | null;
  paymentNumber: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  currency: string;
  amountPaise: number;
  capturedAmountPaise: number;
  refundedAmountPaise: number;
  provider: string | null;
  providerReference: string | null;
  capturedAt: string | null;
  notes: string | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransactionRecord {
  id: number;
  paymentId: number;
  provider: string;
  providerReference: string;
  providerEventId: string | null;
  transactionType: string;
  status: PaymentTransactionStatus;
  amountPaise: number;
  failureCode: string | null;
  failureMessage: string | null;
  metadataJson: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface RefundRecord {
  id: number;
  paymentId: number;
  invoiceId: number | null;
  refundNumber: string;
  status: RefundStatus;
  amountPaise: number;
  reason: string;
  providerRefundReference: string | null;
  processedAt: string | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocationRecord {
  id: number;
  paymentId: number;
  invoiceId: number;
  amountPaise: number;
  allocatedByUserId: number | null;
  createdAt: string;
}

export interface InvoiceWithItems {
  invoice: InvoiceRecord;
  items: InvoiceItemRecord[];
  allocations: PaymentAllocationRecord[];
}

export interface PaymentWithDetails {
  payment: PaymentRecord;
  transactions: PaymentTransactionRecord[];
  allocations: PaymentAllocationRecord[];
  refunds: RefundRecord[];
}

export interface BillingRepository {
  createInvoiceAggregate(input: {
    invoice: Omit<InvoiceRecord, "id">;
    items: Array<Omit<InvoiceItemRecord, "id" | "invoiceId">>;
  }): Promise<InvoiceWithItems>;
  findInvoiceById(id: number): Promise<InvoiceRecord | null>;
  findInvoiceWithItems(id: number): Promise<InvoiceWithItems | null>;
  listInvoices(params: {
    customerId?: number;
    orderId?: number;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<InvoiceRecord>>;
  updateInvoicePdfKey(
    invoiceId: number,
    pdfR2Key: string,
    nowIso: string,
  ): Promise<InvoiceRecord | null>;

  createPayment(input: Omit<PaymentRecord, "id">): Promise<PaymentRecord>;
  findPaymentById(id: number): Promise<PaymentRecord | null>;
  findPaymentWithDetails(id: number): Promise<PaymentWithDetails | null>;
  findPaymentByProviderReference(
    provider: string,
    providerReference: string,
  ): Promise<PaymentRecord | null>;
  listPayments(params: {
    customerId?: number;
    orderId?: number;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<PaymentRecord>>;

  recordPaymentTransactionAndUpdatePayment(input: {
    paymentId: number;
    provider: string;
    providerReference: string;
    providerEventId?: string | null;
    transactionType: string;
    txnStatus: PaymentTransactionStatus;
    nextPaymentStatus: PaymentStatus;
    amountPaise: number;
    capturedAmountPaise: number;
    capturedAt?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    metadataJson?: string | null;
    nowIso: string;
  }): Promise<{ payment: PaymentRecord; transaction: PaymentTransactionRecord; duplicateEvent: boolean }>;

  getPaymentAllocatedTotalPaise(paymentId: number): Promise<number>;
  allocatePaymentToInvoice(input: {
    paymentId: number;
    invoiceId: number;
    amountPaise: number;
    allocatedByUserId?: number | null;
    nowIso: string;
  }): Promise<{ allocation: PaymentAllocationRecord; invoice: InvoiceRecord }>;

  createRefundAndUpdatePayment(input: {
    paymentId: number;
    invoiceId?: number | null;
    refundNumber: string;
    amountPaise: number;
    reason: string;
    providerRefundReference?: string | null;
    nextPaymentStatus: PaymentStatus;
    newRefundedTotalPaise: number;
    createdByUserId?: number | null;
    nowIso: string;
  }): Promise<{ refund: RefundRecord; payment: PaymentRecord }>;
}
