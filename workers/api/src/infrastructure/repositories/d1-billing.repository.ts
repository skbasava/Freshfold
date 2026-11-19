import { and, asc, desc, eq, lt, or, sql } from "drizzle-orm";
import { deriveInvoiceStatusFromAmounts } from "../../domain/entities/invoice";
import type {
  BillingRepository,
  InvoiceItemRecord,
  InvoiceRecord,
  InvoiceWithItems,
  PaymentAllocationRecord,
  PaymentRecord,
  PaymentTransactionRecord,
  PaymentWithDetails,
  RefundRecord,
} from "../../domain/repositories/billing.repository";
import type {
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
  PricingBasis,
  RefundStatus,
  TaxSupplyType,
} from "../../shared/constants";
import { NotFoundError } from "../../shared/errors";
import {
  buildCursorPage,
  type CursorPage,
  type CursorPayload,
} from "../../shared/pagination";
import { mapSqliteError, type ApiDatabase } from "../db/client";
import {
  invoiceItems,
  invoices,
  paymentAllocations,
  payments,
  paymentTransactions,
  refunds,
} from "../db/schema";

function mapInvoiceRow(row: typeof invoices.$inferSelect): InvoiceRecord {
  return {
    ...row,
    status: row.status as InvoiceStatus,
    taxSupplyType: row.taxSupplyType as TaxSupplyType,
  };
}

function mapInvoiceItemRow(
  row: typeof invoiceItems.$inferSelect,
): InvoiceItemRecord {
  return {
    ...row,
    pricingBasis: row.pricingBasis as PricingBasis,
  };
}

function mapPaymentRow(row: typeof payments.$inferSelect): PaymentRecord {
  return {
    ...row,
    paymentMethod: row.paymentMethod as PaymentMethod,
    status: row.status as PaymentStatus,
  };
}

function mapTxnRow(
  row: typeof paymentTransactions.$inferSelect,
): PaymentTransactionRecord {
  return {
    ...row,
    status: row.status as PaymentTransactionStatus,
  };
}

function mapRefundRow(row: typeof refunds.$inferSelect): RefundRecord {
  return {
    ...row,
    status: row.status as RefundStatus,
  };
}

export class D1BillingRepository implements BillingRepository {
  constructor(
    private readonly db: ApiDatabase,
    private readonly d1: D1Database,
  ) {}

  async createInvoiceAggregate(input: {
    invoice: Omit<InvoiceRecord, "id">;
    items: Array<Omit<InvoiceItemRecord, "id" | "invoiceId">>;
  }): Promise<InvoiceWithItems> {
    try {
      const inv = input.invoice;
      const statements: D1PreparedStatement[] = [
        this.d1
          .prepare(
            `INSERT INTO invoices (
              branch_id, order_id, customer_id, invoice_number, status, currency,
              supplier_name_snapshot, supplier_gstin_snapshot, supplier_state_code,
              customer_name_snapshot, customer_gstin_snapshot, place_of_supply_state_code,
              tax_supply_type, subtotal_paise, discount_paise, taxable_amount_paise,
              cgst_paise, sgst_paise, igst_paise, total_tax_paise, total_amount_paise,
              paid_amount_paise, balance_due_paise, issued_at, due_at, pdf_r2_key,
              created_by_user_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            inv.branchId,
            inv.orderId,
            inv.customerId,
            inv.invoiceNumber,
            inv.status,
            inv.currency,
            inv.supplierNameSnapshot,
            inv.supplierGstinSnapshot,
            inv.supplierStateCode,
            inv.customerNameSnapshot,
            inv.customerGstinSnapshot,
            inv.placeOfSupplyStateCode,
            inv.taxSupplyType,
            inv.subtotalPaise,
            inv.discountPaise,
            inv.taxableAmountPaise,
            inv.cgstPaise,
            inv.sgstPaise,
            inv.igstPaise,
            inv.totalTaxPaise,
            inv.totalAmountPaise,
            inv.paidAmountPaise,
            inv.balanceDuePaise,
            inv.issuedAt,
            inv.dueAt,
            inv.pdfR2Key,
            inv.createdByUserId,
            inv.createdAt,
            inv.updatedAt,
          ),
      ];

      for (const line of input.items) {
        statements.push(
          this.d1
            .prepare(
              `INSERT INTO invoice_items (
                invoice_id, order_item_id, description, hsn_sac_code, pricing_basis,
                quantity_pieces, weight_grams, unit_price_paise, gross_amount_paise,
                discount_paise, taxable_amount_paise, tax_rate_bps, cgst_rate_bps,
                sgst_rate_bps, igst_rate_bps, cgst_amount_paise, sgst_amount_paise,
                igst_amount_paise, total_tax_paise, line_total_paise, created_at
              ) VALUES (
                (SELECT id FROM invoices WHERE invoice_number = ?),
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              )`,
            )
            .bind(
              inv.invoiceNumber,
              line.orderItemId,
              line.description,
              line.hsnSacCode,
              line.pricingBasis,
              line.quantityPieces,
              line.weightGrams,
              line.unitPricePaise,
              line.grossAmountPaise,
              line.discountPaise,
              line.taxableAmountPaise,
              line.taxRateBps,
              line.cgstRateBps,
              line.sgstRateBps,
              line.igstRateBps,
              line.cgstAmountPaise,
              line.sgstAmountPaise,
              line.igstAmountPaise,
              line.totalTaxPaise,
              line.lineTotalPaise,
              line.createdAt,
            ),
        );
      }

      await this.d1.batch(statements);

      const [created] = await this.db
        .select()
        .from(invoices)
        .where(eq(invoices.invoiceNumber, inv.invoiceNumber))
        .limit(1);

      if (!created) {
        throw new Error("Invoice not found after atomic commit");
      }

      const full = await this.findInvoiceWithItems(created.id);
      if (!full) {
        throw new Error("Invoice items not found after commit");
      }
      return full;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async findInvoiceById(id: number): Promise<InvoiceRecord | null> {
    const [row] = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);
    return row ? mapInvoiceRow(row) : null;
  }

  async findInvoiceWithItems(id: number): Promise<InvoiceWithItems | null> {
    const invoice = await this.findInvoiceById(id);
    if (!invoice) return null;

    const [itemRows, allocRows] = await Promise.all([
      this.db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, id))
        .orderBy(asc(invoiceItems.id)),
      this.db
        .select()
        .from(paymentAllocations)
        .where(eq(paymentAllocations.invoiceId, id))
        .orderBy(asc(paymentAllocations.id)),
    ]);

    return {
      invoice,
      items: itemRows.map(mapInvoiceItemRow),
      allocations: allocRows,
    };
  }

  async listInvoices(params: {
    customerId?: number;
    orderId?: number;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<InvoiceRecord>> {
    const conditions = [];
    if (params.customerId !== undefined) {
      conditions.push(eq(invoices.customerId, params.customerId));
    }
    if (params.orderId !== undefined) {
      conditions.push(eq(invoices.orderId, params.orderId));
    }
    if (params.cursor) {
      conditions.push(
        or(
          lt(invoices.createdAt, params.cursor.createdAt),
          and(
            eq(invoices.createdAt, params.cursor.createdAt),
            lt(invoices.id, params.cursor.id),
          ),
        ),
      );
    }

    const rows = await this.db
      .select()
      .from(invoices)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(invoices.createdAt), desc(invoices.id))
      .limit(params.limit + 1);

    return buildCursorPage(rows.map(mapInvoiceRow), params.limit);
  }

  async updateInvoicePdfKey(
    invoiceId: number,
    pdfR2Key: string,
    nowIso: string,
  ): Promise<InvoiceRecord | null> {
    const [row] = await this.db
      .update(invoices)
      .set({ pdfR2Key, updatedAt: nowIso })
      .where(eq(invoices.id, invoiceId))
      .returning();
    return row ? mapInvoiceRow(row) : null;
  }

  async createPayment(input: Omit<PaymentRecord, "id">): Promise<PaymentRecord> {
    try {
      const [row] = await this.db
        .insert(payments)
        .values(input)
        .returning();
      return mapPaymentRow(row!);
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async findPaymentById(id: number): Promise<PaymentRecord | null> {
    const [row] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);
    return row ? mapPaymentRow(row) : null;
  }

  async findPaymentWithDetails(id: number): Promise<PaymentWithDetails | null> {
    const payment = await this.findPaymentById(id);
    if (!payment) return null;

    const [txns, allocs, refundRows] = await Promise.all([
      this.db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.paymentId, id))
        .orderBy(asc(paymentTransactions.id)),
      this.db
        .select()
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, id))
        .orderBy(asc(paymentAllocations.id)),
      this.db
        .select()
        .from(refunds)
        .where(eq(refunds.paymentId, id))
        .orderBy(asc(refunds.id)),
    ]);

    return {
      payment,
      transactions: txns.map(mapTxnRow),
      allocations: allocs,
      refunds: refundRows.map(mapRefundRow),
    };
  }

  async findPaymentByProviderReference(
    provider: string,
    providerReference: string,
  ): Promise<PaymentRecord | null> {
    const [row] = await this.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.provider, provider),
          eq(payments.providerReference, providerReference),
        ),
      )
      .limit(1);
    return row ? mapPaymentRow(row) : null;
  }

  async listPayments(params: {
    customerId?: number;
    orderId?: number;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<PaymentRecord>> {
    const conditions = [];
    if (params.customerId !== undefined) {
      conditions.push(eq(payments.customerId, params.customerId));
    }
    if (params.orderId !== undefined) {
      conditions.push(eq(payments.orderId, params.orderId));
    }
    if (params.cursor) {
      conditions.push(
        or(
          lt(payments.createdAt, params.cursor.createdAt),
          and(
            eq(payments.createdAt, params.cursor.createdAt),
            lt(payments.id, params.cursor.id),
          ),
        ),
      );
    }

    const rows = await this.db
      .select()
      .from(payments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(params.limit + 1);

    return buildCursorPage(rows.map(mapPaymentRow), params.limit);
  }

  async recordPaymentTransactionAndUpdatePayment(input: {
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
  }): Promise<{
    payment: PaymentRecord;
    transaction: PaymentTransactionRecord;
    duplicateEvent: boolean;
  }> {
    try {
      if (input.providerEventId) {
        const [existingTxn] = await this.db
          .select()
          .from(paymentTransactions)
          .where(
            and(
              eq(paymentTransactions.provider, input.provider),
              eq(paymentTransactions.providerEventId, input.providerEventId),
            ),
          )
          .limit(1);

        if (existingTxn) {
          const payment = await this.findPaymentById(input.paymentId);
          if (!payment) {
            throw new NotFoundError(`Payment #${input.paymentId} not found`);
          }
          return {
            payment,
            transaction: mapTxnRow(existingTxn),
            duplicateEvent: true,
          };
        }
      }

      const [txnRows, payRows] = await this.db.batch([
        this.db
          .insert(paymentTransactions)
          .values({
            paymentId: input.paymentId,
            provider: input.provider,
            providerReference: input.providerReference,
            providerEventId: input.providerEventId ?? null,
            transactionType: input.transactionType,
            status: input.txnStatus,
            amountPaise: input.amountPaise,
            failureCode: input.failureCode ?? null,
            failureMessage: input.failureMessage ?? null,
            metadataJson: input.metadataJson ?? null,
            processedAt: input.nowIso,
            createdAt: input.nowIso,
          })
          .returning(),
        this.db
          .update(payments)
          .set({
            status: input.nextPaymentStatus,
            capturedAmountPaise: input.capturedAmountPaise,
            capturedAt: input.capturedAt ?? null,
            updatedAt: input.nowIso,
          })
          .where(eq(payments.id, input.paymentId))
          .returning(),
      ]);

      return {
        payment: mapPaymentRow(payRows[0]!),
        transaction: mapTxnRow(txnRows[0]!),
        duplicateEvent: false,
      };
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async getPaymentAllocatedTotalPaise(paymentId: number): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${paymentAllocations.amountPaise}), 0)`,
      })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, paymentId));
    return Number(row?.total ?? 0);
  }

  async allocatePaymentToInvoice(input: {
    paymentId: number;
    invoiceId: number;
    amountPaise: number;
    allocatedByUserId?: number | null;
    nowIso: string;
  }): Promise<{ allocation: PaymentAllocationRecord; invoice: InvoiceRecord }> {
    try {
      const invoice = await this.findInvoiceById(input.invoiceId);
      if (!invoice) {
        throw new NotFoundError(`Invoice #${input.invoiceId} not found`);
      }

      const newPaid = invoice.paidAmountPaise + input.amountPaise;
      const newBalance = invoice.totalAmountPaise - newPaid;
      const nextStatus = deriveInvoiceStatusFromAmounts(
        invoice.totalAmountPaise,
        newPaid,
        invoice.status,
      );

      const [allocRows, invoiceRows] = await this.db.batch([
        this.db
          .insert(paymentAllocations)
          .values({
            paymentId: input.paymentId,
            invoiceId: input.invoiceId,
            amountPaise: input.amountPaise,
            allocatedByUserId: input.allocatedByUserId ?? null,
            createdAt: input.nowIso,
          })
          .returning(),
        this.db
          .update(invoices)
          .set({
            paidAmountPaise: newPaid,
            balanceDuePaise: newBalance,
            status: nextStatus,
            updatedAt: input.nowIso,
          })
          .where(eq(invoices.id, input.invoiceId))
          .returning(),
      ]);

      return {
        allocation: allocRows[0]!,
        invoice: mapInvoiceRow(invoiceRows[0]!),
      };
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async createRefundAndUpdatePayment(input: {
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
  }): Promise<{ refund: RefundRecord; payment: PaymentRecord }> {
    try {
      const [refundRows, payRows] = await this.db.batch([
        this.db
          .insert(refunds)
          .values({
            paymentId: input.paymentId,
            invoiceId: input.invoiceId ?? null,
            refundNumber: input.refundNumber,
            status: "processed",
            amountPaise: input.amountPaise,
            reason: input.reason,
            providerRefundReference: input.providerRefundReference ?? null,
            processedAt: input.nowIso,
            createdByUserId: input.createdByUserId ?? null,
            createdAt: input.nowIso,
            updatedAt: input.nowIso,
          })
          .returning(),
        this.db
          .update(payments)
          .set({
            status: input.nextPaymentStatus,
            refundedAmountPaise: input.newRefundedTotalPaise,
            updatedAt: input.nowIso,
          })
          .where(eq(payments.id, input.paymentId))
          .returning(),
      ]);

      return {
        refund: mapRefundRow(refundRows[0]!),
        payment: mapPaymentRow(payRows[0]!),
      };
    } catch (error) {
      mapSqliteError(error);
    }
  }
}
