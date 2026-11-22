import { assertInvoiceCanAcceptAllocation } from "../../domain/entities/invoice";
import {
  assertAllocationWithinBounds,
  assertPaymentAllocatable,
  assertPaymentStatusTransition,
  assertRefundWithinBounds,
} from "../../domain/entities/payment";
import type {
  BillingRepository,
  InvoiceRecord,
  InvoiceWithItems,
  PaymentAllocationRecord,
  PaymentRecord,
  PaymentWithDetails,
  RefundRecord,
} from "../../domain/repositories/billing.repository";
import type { CustomerRepository } from "../../domain/repositories/customer.repository";
import type { OrderRepository } from "../../domain/repositories/order.repository";
import type {
  PaymentProviderPort,
  PaymentWebhookPayload,
  StoragePort,
  StoredObjectContent,
} from "../../domain/repositories/storage.port";
import type { SystemRepository } from "../../domain/repositories/system.repository";
import {
  CURRENCY_INR,
  type PaymentMethod,
  type PaymentStatus,
  type PaymentTransactionStatus,
} from "../../shared/constants";
import {
  InvariantViolationError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../shared/errors";
import {
  clampPageLimit,
  decodeCursor,
  type CursorPage,
} from "../../shared/pagination";
import type { Clock } from "../../shared/time";
import {
  IdempotencyService,
  type IdempotentResult,
} from "../services/idempotency.service";

export interface BillingUseCasesDeps {
  customers: CustomerRepository;
  orders: OrderRepository;
  billing: BillingRepository;
  storage: StoragePort;
  paymentProvider: PaymentProviderPort;
  system: SystemRepository;
  clock: Clock;
}

export class BillingUseCases {
  private readonly idempotency: IdempotencyService;

  constructor(private readonly deps: BillingUseCasesDeps) {
    this.idempotency = new IdempotencyService(deps.system, deps.clock);
  }

  /**
   * Creates an invoice from immutable order item snapshots.
   * Supports partial billing (explicit subset of `orderItemIds`) and multiple
   * invoices per order. Issued invoices are immutable.
   */
  async createInvoiceForOrder(
    orderId: number,
    input: {
      orderItemIds?: number[];
      issueImmediately?: boolean;
      dueAt?: string | null;
      actorUserId?: number | null;
      requestId?: string;
    },
  ): Promise<InvoiceWithItems> {
    const details = await this.deps.orders.findWithDetails(orderId);
    if (!details) {
      throw new NotFoundError(`Order #${orderId} not found`);
    }
    if (details.order.status === "cancelled") {
      throw new InvariantViolationError("Cannot create an invoice for a cancelled order");
    }

    const customer = await this.deps.customers.findById(details.order.customerId);
    if (!customer) {
      throw new NotFoundError("Order customer record not found");
    }

    const selectedItems = input.orderItemIds
      ? details.items.filter((item) => input.orderItemIds!.includes(item.id))
      : details.items;

    if (selectedItems.length === 0) {
      throw new ValidationError("No matching order items found for invoice creation");
    }
    if (input.orderItemIds && selectedItems.length !== input.orderItemIds.length) {
      throw new ValidationError("One or more orderItemIds do not belong to this order");
    }

    const nowIso = this.deps.clock.nowIso();
    let subtotalPaise = 0;
    let discountPaise = 0;
    let taxableAmountPaise = 0;
    let cgstPaise = 0;
    let sgstPaise = 0;
    let igstPaise = 0;
    let totalTaxPaise = 0;
    let totalAmountPaise = 0;

    const invoiceLines = selectedItems.map((item) => {
      subtotalPaise += item.grossAmountPaise;
      discountPaise += item.discountPaise;
      taxableAmountPaise += item.taxableAmountPaise;
      cgstPaise += item.cgstAmountPaise;
      sgstPaise += item.sgstAmountPaise;
      igstPaise += item.igstAmountPaise;
      totalTaxPaise += item.totalTaxPaise;
      totalAmountPaise += item.lineTotalPaise;

      const description = item.itemNameSnapshot
        ? `${item.serviceNameSnapshot} — ${item.itemNameSnapshot}`
        : `${item.serviceNameSnapshot} (Weight-based)`;

      return {
        orderItemId: item.id,
        description,
        hsnSacCode: item.hsnSacCodeSnapshot,
        pricingBasis: item.pricingBasis,
        quantityPieces: item.quantityPieces,
        weightGrams: item.weightGrams,
        unitPricePaise: item.unitPricePaise,
        grossAmountPaise: item.grossAmountPaise,
        discountPaise: item.discountPaise,
        taxableAmountPaise: item.taxableAmountPaise,
        taxRateBps: item.taxRateBps,
        cgstRateBps: item.cgstRateBps,
        sgstRateBps: item.sgstRateBps,
        igstRateBps: item.igstRateBps,
        cgstAmountPaise: item.cgstAmountPaise,
        sgstAmountPaise: item.sgstAmountPaise,
        igstAmountPaise: item.igstAmountPaise,
        totalTaxPaise: item.totalTaxPaise,
        lineTotalPaise: item.lineTotalPaise,
        createdAt: nowIso,
      };
    });

    const issue = input.issueImmediately ?? true;
    const invoiceNumber = `INV-${nowIso.slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const created = await this.deps.billing.createInvoiceAggregate({
      invoice: {
        branchId: details.order.branchId,
        orderId: details.order.id,
        customerId: customer.id,
        invoiceNumber,
        status: issue ? "issued" : "draft",
        currency: CURRENCY_INR,
        supplierNameSnapshot: "FreshFold Laundry Services",
        supplierGstinSnapshot: customer.gstin ? "29AAAAA0000A1Z5" : null,
        supplierStateCode: details.order.supplierStateCode ?? "29",
        customerNameSnapshot: customer.fullName,
        customerGstinSnapshot: customer.gstin,
        placeOfSupplyStateCode: details.order.placeOfSupplyStateCode,
        taxSupplyType: details.order.taxSupplyType,
        subtotalPaise,
        discountPaise,
        taxableAmountPaise,
        cgstPaise,
        sgstPaise,
        igstPaise,
        totalTaxPaise,
        totalAmountPaise,
        paidAmountPaise: 0,
        balanceDuePaise: totalAmountPaise,
        issuedAt: issue ? nowIso : null,
        dueAt: input.dueAt ?? null,
        pdfR2Key: null,
        createdByUserId: input.actorUserId ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      items: invoiceLines,
    });

    await this.deps.system.recordAudit({
      actorUserId: input.actorUserId ?? null,
      action: "invoice.created",
      entityType: "invoice",
      entityId: String(created.invoice.id),
      requestId: input.requestId ?? null,
      summaryJson: JSON.stringify({
        invoiceNumber: created.invoice.invoiceNumber,
        status: created.invoice.status,
        totalAmountPaise: created.invoice.totalAmountPaise,
      }),
      nowIso,
    });

    return created;
  }

  async getInvoice(id: number): Promise<InvoiceWithItems> {
    const result = await this.deps.billing.findInvoiceWithItems(id);
    if (!result) {
      throw new NotFoundError(`Invoice #${id} not found`);
    }
    return result;
  }

  listInvoices(params: {
    customerId?: number;
    orderId?: number;
    limit?: number;
    cursor?: string;
  }): Promise<CursorPage<InvoiceRecord>> {
    return this.deps.billing.listInvoices({
      customerId: params.customerId,
      orderId: params.orderId,
      limit: clampPageLimit(params.limit),
      cursor: params.cursor ? decodeCursor(params.cursor) : undefined,
    });
  }

  async uploadInvoicePdf(params: {
    invoiceId: number;
    bytes: ArrayBuffer;
  }): Promise<InvoiceRecord> {
    const invoice = await this.deps.billing.findInvoiceById(params.invoiceId);
    if (!invoice) {
      throw new NotFoundError(`Invoice #${params.invoiceId} not found`);
    }
    if (params.bytes.byteLength === 0) {
      throw new ValidationError("PDF document cannot be empty");
    }

    const key = `invoices/${invoice.invoiceNumber}.pdf`;
    await this.deps.storage.putObject({
      key,
      body: params.bytes,
      contentType: "application/pdf",
      customMetadata: {
        invoiceId: String(invoice.id),
        invoiceNumber: invoice.invoiceNumber,
      },
    });

    const updated = await this.deps.billing.updateInvoicePdfKey(
      invoice.id,
      key,
      this.deps.clock.nowIso(),
    );
    if (!updated) {
      throw new NotFoundError(`Invoice #${params.invoiceId} not found`);
    }
    return updated;
  }

  async downloadInvoicePdf(invoiceId: number): Promise<StoredObjectContent> {
    const invoice = await this.deps.billing.findInvoiceById(invoiceId);
    if (!invoice || !invoice.pdfR2Key) {
      throw new NotFoundError(`PDF for invoice #${invoiceId} not found`);
    }
    const obj = await this.deps.storage.getObject(invoice.pdfR2Key);
    if (!obj) {
      throw new NotFoundError(`Stored R2 PDF '${invoice.pdfR2Key}' not found`);
    }
    return obj;
  }

  /**
   * Initiates a payment (idempotent via Idempotency-Key).
   * Online gateway payments remain `pending` until confirmed via verified webhook.
   */
  async createPayment(input: {
    customerId: number;
    orderId?: number | null;
    paymentMethod: PaymentMethod;
    amountPaise: number;
    captureImmediately?: boolean;
    provider?: string | null;
    providerReference?: string | null;
    notes?: string | null;
    allocations?: Array<{ invoiceId: number; amountPaise: number }>;
    idempotencyKey?: string | null;
    actorUserId?: number | null;
    requestId?: string;
  }): Promise<IdempotentResult<PaymentWithDetails>> {
    return this.idempotency.execute<PaymentWithDetails>({
      operation: "payments.create",
      idempotencyKey: input.idempotencyKey,
      payload: {
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        paymentMethod: input.paymentMethod,
        amountPaise: input.amountPaise,
        captureImmediately: input.captureImmediately ?? false,
        provider: input.provider ?? null,
        providerReference: input.providerReference ?? null,
        allocations: input.allocations ?? [],
      },
      statusCode: 201,
      run: async () => {
        if (input.paymentMethod === "online_gateway" && input.captureImmediately) {
          throw new ValidationError(
            "Online gateway payments cannot be marked captured before provider confirmation",
          );
        }

        const customer = await this.deps.customers.findById(input.customerId);
        if (!customer) {
          throw new NotFoundError(`Customer #${input.customerId} not found`);
        }

        const nowIso = this.deps.clock.nowIso();
        const captured = Boolean(input.captureImmediately);
        const paymentNumber = `PAY-${nowIso.slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

        const payment = await this.deps.billing.createPayment({
          branchId: customer.branchId,
          customerId: customer.id,
          orderId: input.orderId ?? null,
          paymentNumber,
          paymentMethod: input.paymentMethod,
          status: captured ? "captured" : "pending",
          currency: CURRENCY_INR,
          amountPaise: input.amountPaise,
          capturedAmountPaise: captured ? input.amountPaise : 0,
          refundedAmountPaise: 0,
          provider: input.provider ?? (input.paymentMethod === "online_gateway" ? "gateway" : "counter"),
          providerReference: input.providerReference ?? paymentNumber,
          capturedAt: captured ? nowIso : null,
          notes: input.notes ?? null,
          createdByUserId: input.actorUserId ?? null,
          createdAt: nowIso,
          updatedAt: nowIso,
        });

        if (captured && input.allocations && input.allocations.length > 0) {
          for (const alloc of input.allocations) {
            await this.allocatePayment(payment.id, {
              invoiceId: alloc.invoiceId,
              amountPaise: alloc.amountPaise,
              actorUserId: input.actorUserId,
            });
          }
        } else if (!captured && input.allocations && input.allocations.length > 0) {
          throw new InvariantViolationError(
            "Cannot allocate an uncaptured/pending payment to invoices",
          );
        }

        await this.deps.system.recordAudit({
          actorUserId: input.actorUserId ?? null,
          action: "payment.created",
          entityType: "payment",
          entityId: String(payment.id),
          requestId: input.requestId ?? null,
          summaryJson: JSON.stringify({
            paymentNumber: payment.paymentNumber,
            status: payment.status,
            amountPaise: payment.amountPaise,
          }),
          nowIso,
        });

        const full = await this.deps.billing.findPaymentWithDetails(payment.id);
        if (!full) {
          throw new NotFoundError(`Payment #${payment.id} not found after creation`);
        }
        return full;
      },
    });
  }

  async getPayment(id: number): Promise<PaymentWithDetails> {
    const payment = await this.deps.billing.findPaymentWithDetails(id);
    if (!payment) {
      throw new NotFoundError(`Payment #${id} not found`);
    }
    return payment;
  }

  listPayments(params: {
    customerId?: number;
    orderId?: number;
    limit?: number;
    cursor?: string;
  }): Promise<CursorPage<PaymentRecord>> {
    return this.deps.billing.listPayments({
      customerId: params.customerId,
      orderId: params.orderId,
      limit: clampPageLimit(params.limit),
      cursor: params.cursor ? decodeCursor(params.cursor) : undefined,
    });
  }

  async allocatePayment(
    paymentId: number,
    input: {
      invoiceId: number;
      amountPaise: number;
      actorUserId?: number | null;
    },
  ): Promise<{ allocation: PaymentAllocationRecord; invoice: InvoiceRecord }> {
    const payment = await this.deps.billing.findPaymentById(paymentId);
    if (!payment) {
      throw new NotFoundError(`Payment #${paymentId} not found`);
    }
    assertPaymentAllocatable(payment.status);

    const invoice = await this.deps.billing.findInvoiceById(input.invoiceId);
    if (!invoice) {
      throw new NotFoundError(`Invoice #${input.invoiceId} not found`);
    }
    assertInvoiceCanAcceptAllocation(invoice.status);

    if (invoice.customerId !== payment.customerId) {
      throw new InvariantViolationError(
        "Cannot allocate a payment to an invoice belonging to a different customer",
      );
    }

    const alreadyAllocated =
      await this.deps.billing.getPaymentAllocatedTotalPaise(payment.id);

    assertAllocationWithinBounds({
      allocationPaise: input.amountPaise,
      paymentCapturedPaise: payment.capturedAmountPaise,
      paymentAlreadyAllocatedPaise: alreadyAllocated,
      paymentRefundedPaise: payment.refundedAmountPaise,
      invoiceBalanceDuePaise: invoice.balanceDuePaise,
    });

    return this.deps.billing.allocatePaymentToInvoice({
      paymentId: payment.id,
      invoiceId: invoice.id,
      amountPaise: input.amountPaise,
      allocatedByUserId: input.actorUserId ?? null,
      nowIso: this.deps.clock.nowIso(),
    });
  }

  async handlePaymentWebhook(input: {
    rawBody: string;
    signatureHeader: string | undefined;
    webhookSecret: string;
    payload: PaymentWebhookPayload;
  }): Promise<{ payment: PaymentRecord; duplicateEvent: boolean }> {
    const valid = await this.deps.paymentProvider.verifyWebhookSignature(
      input.rawBody,
      input.signatureHeader,
      input.webhookSecret,
    );
    if (!valid) {
      throw new UnauthorizedError("Invalid payment webhook signature");
    }

    const payment = await this.deps.billing.findPaymentByProviderReference(
      input.payload.provider,
      input.payload.providerReference,
    );
    if (!payment) {
      throw new NotFoundError(
        `Payment for provider reference '${input.payload.providerReference}' not found`,
      );
    }

    const nowIso = this.deps.clock.nowIso();
    let nextStatus: PaymentStatus;
    let txnStatus: PaymentTransactionStatus;
    let capturedAmountPaise = payment.capturedAmountPaise;
    let capturedAt = payment.capturedAt;

    if (input.payload.eventType === "payment.captured") {
      nextStatus = "captured";
      txnStatus = "succeeded";
      capturedAmountPaise = input.payload.amountPaise;
      capturedAt = nowIso;
    } else if (input.payload.eventType === "payment.authorized") {
      nextStatus = "authorized";
      txnStatus = "pending";
    } else {
      nextStatus = "failed";
      txnStatus = "failed";
    }

    // If the exact event was already processed, recordPaymentTransactionAndUpdatePayment
    // detects duplicateEvent cleanly; otherwise validate the state transition.
    const result =
      await this.deps.billing.recordPaymentTransactionAndUpdatePayment({
        paymentId: payment.id,
        provider: input.payload.provider,
        providerReference: input.payload.providerReference,
        providerEventId: input.payload.providerEventId,
        transactionType: input.payload.eventType,
        txnStatus,
        nextPaymentStatus: nextStatus,
        amountPaise: input.payload.amountPaise,
        capturedAmountPaise,
        capturedAt,
        failureCode: input.payload.failureCode ?? null,
        failureMessage: input.payload.failureMessage ?? null,
        nowIso,
      });

    if (!result.duplicateEvent && payment.status !== nextStatus) {
      // Transition guard verified inside repository before commit
      assertPaymentStatusTransition(payment.status, nextStatus);
    }

    return {
      payment: result.payment,
      duplicateEvent: result.duplicateEvent,
    };
  }

  async createRefund(
    paymentId: number,
    input: {
      invoiceId?: number | null;
      amountPaise: number;
      reason: string;
      providerRefundReference?: string | null;
      actorUserId?: number | null;
      requestId?: string;
    },
  ): Promise<{ refund: RefundRecord; payment: PaymentRecord }> {
    const payment = await this.deps.billing.findPaymentById(paymentId);
    if (!payment) {
      throw new NotFoundError(`Payment #${paymentId} not found`);
    }
    if (payment.status !== "captured" && payment.status !== "partially_refunded") {
      throw new InvariantViolationError(
        `Cannot refund payment in status '${payment.status}'`,
      );
    }

    assertRefundWithinBounds({
      refundPaise: input.amountPaise,
      paymentCapturedPaise: payment.capturedAmountPaise,
      alreadyRefundedPaise: payment.refundedAmountPaise,
    });

    const newRefundedTotalPaise = payment.refundedAmountPaise + input.amountPaise;
    const nextPaymentStatus: PaymentStatus =
      newRefundedTotalPaise >= payment.capturedAmountPaise
        ? "refunded"
        : "partially_refunded";

    assertPaymentStatusTransition(payment.status, nextPaymentStatus);

    const nowIso = this.deps.clock.nowIso();
    const refundNumber = `REF-${nowIso.slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const created = await this.deps.billing.createRefundAndUpdatePayment({
      paymentId: payment.id,
      invoiceId: input.invoiceId ?? null,
      refundNumber,
      amountPaise: input.amountPaise,
      reason: input.reason,
      providerRefundReference: input.providerRefundReference ?? null,
      nextPaymentStatus,
      newRefundedTotalPaise,
      createdByUserId: input.actorUserId ?? null,
      nowIso,
    });

    await this.deps.system.recordAudit({
      actorUserId: input.actorUserId ?? null,
      action: "refund.processed",
      entityType: "refund",
      entityId: String(created.refund.id),
      requestId: input.requestId ?? null,
      summaryJson: JSON.stringify({
        refundNumber: created.refund.refundNumber,
        amountPaise: created.refund.amountPaise,
        paymentId: payment.id,
      }),
      nowIso,
    });

    return created;
  }

  async getOrderBillingSummary(orderId: number): Promise<OrderBillingSummary> {
    const details = await this.deps.orders.findWithDetails(orderId);
    if (!details) {
      throw new NotFoundError(`Order #${orderId} not found`);
    }

    const [paymentsPage, invoicesPage] = await Promise.all([
      this.deps.billing.listPayments({ orderId, limit: 100 }),
      this.deps.billing.listInvoices({ orderId, limit: 100 }),
    ]);

    const capturedPayments = paymentsPage.items.filter((p) =>
      ["captured", "partially_refunded", "refunded"].includes(p.status),
    );

    const capturedAmountPaise = capturedPayments.reduce(
      (sum, p) => sum + p.capturedAmountPaise,
      0,
    );

    const refundedAmountPaise = capturedPayments.reduce(
      (sum, p) => sum + p.refundedAmountPaise,
      0,
    );

    const netPaidAmountPaise = Math.max(0, capturedAmountPaise - refundedAmountPaise);
    const balanceDuePaise = Math.max(0, details.order.totalAmountPaise - netPaidAmountPaise);

    let paymentStatus: "paid" | "partially_paid" | "unpaid" | "refunded" = "unpaid";
    if (refundedAmountPaise > 0 && netPaidAmountPaise === 0) {
      paymentStatus = "refunded";
    } else if (netPaidAmountPaise >= details.order.totalAmountPaise && details.order.totalAmountPaise > 0) {
      paymentStatus = "paid";
    } else if (netPaidAmountPaise > 0) {
      paymentStatus = "partially_paid";
    }

    const paymentDetails = await Promise.all(
      paymentsPage.items.map((p) => this.deps.billing.findPaymentWithDetails(p.id)),
    );
    const allRefunds: RefundRecord[] = paymentDetails.flatMap((d) => d?.refunds ?? []);

    return {
      orderId: details.order.id,
      orderNumber: details.order.orderNumber,
      customerId: details.order.customerId,
      totalAmountPaise: details.order.totalAmountPaise,
      capturedAmountPaise,
      refundedAmountPaise,
      netPaidAmountPaise,
      balanceDuePaise,
      paymentStatus,
      payments: paymentsPage.items,
      refunds: allRefunds,
      invoices: invoicesPage.items,
    };
  }

  async getCustomerBillingSummary(customerId: number): Promise<CustomerBillingSummary> {
    const customer = await this.deps.customers.findById(customerId);
    if (!customer) {
      throw new NotFoundError(`Customer #${customerId} not found`);
    }

    const [ordersPage, paymentsPage] = await Promise.all([
      this.deps.orders.list({ customerId, limit: 100 }),
      this.deps.billing.listPayments({ customerId, limit: 100 }),
    ]);

    const totalOrdersCount = ordersPage.items.length;
    const totalBilledPaise = ordersPage.items.reduce(
      (sum, o) => sum + o.totalAmountPaise,
      0,
    );

    const capturedPayments = paymentsPage.items.filter((p) =>
      ["captured", "partially_refunded", "refunded"].includes(p.status),
    );

    const capturedAmountPaise = capturedPayments.reduce(
      (sum, p) => sum + p.capturedAmountPaise,
      0,
    );

    const refundedAmountPaise = capturedPayments.reduce(
      (sum, p) => sum + p.refundedAmountPaise,
      0,
    );

    const netPaidAmountPaise = Math.max(0, capturedAmountPaise - refundedAmountPaise);
    const outstandingDuePaise = Math.max(0, totalBilledPaise - netPaidAmountPaise);

    const paymentStatus =
      outstandingDuePaise === 0
        ? totalBilledPaise === 0
          ? "clear"
          : "paid"
        : "has_due";

    return {
      customerId,
      totalOrdersCount,
      totalBilledPaise,
      capturedAmountPaise,
      refundedAmountPaise,
      netPaidAmountPaise,
      outstandingDuePaise,
      paymentStatus,
    };
  }

  async recordOrderPayment(input: {
    orderId: number;
    paymentMethod: PaymentMethod;
    amountPaise: number;
    notes?: string | null;
    idempotencyKey?: string | null;
    actorUserId?: number | null;
    requestId?: string;
  }): Promise<{ payment: PaymentRecord; billing: OrderBillingSummary }> {
    const details = await this.deps.orders.findWithDetails(input.orderId);
    if (!details) {
      throw new NotFoundError(`Order #${input.orderId} not found`);
    }

    if (input.amountPaise <= 0) {
      throw new ValidationError("Payment amount must be greater than zero");
    }

    const paymentResult = await this.createPayment({
      customerId: details.order.customerId,
      orderId: details.order.id,
      paymentMethod: input.paymentMethod,
      amountPaise: input.amountPaise,
      captureImmediately: input.paymentMethod !== "online_gateway",
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
    });

    // Check if an issued invoice exists for this order with balance due
    const invoicePage = await this.deps.billing.listInvoices({
      orderId: details.order.id,
      limit: 10,
    });
    const issuedInvoice = invoicePage.items.find(
      (inv) => inv.status === "issued" && inv.balanceDuePaise > 0,
    );
    if (issuedInvoice && paymentResult.data.payment.status === "captured") {
      const allocAmount = Math.min(
        input.amountPaise,
        issuedInvoice.balanceDuePaise,
      );
      if (allocAmount > 0) {
        await this.allocatePayment(paymentResult.data.payment.id, {
          invoiceId: issuedInvoice.id,
          amountPaise: allocAmount,
          actorUserId: input.actorUserId,
        }).catch(() => undefined);
      }
    }

    const billing = await this.getOrderBillingSummary(details.order.id);
    return {
      payment: paymentResult.data.payment,
      billing,
    };
  }
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
  payments: PaymentRecord[];
  refunds: RefundRecord[];
  invoices: InvoiceRecord[];
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
