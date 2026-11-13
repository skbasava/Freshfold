import type { Payment, PaymentMethod, PaymentTxStatus } from '../domain/types';
import { BaseRepository, type RepositoryContext } from './base.repository';
import type { LaundryDatabase } from '../database/db';

export interface RecordPaymentInput {
  id?: string;
  orderId: string;
  amountMinor: number;
  method: PaymentMethod;
  providerReference?: string | null;
  idempotencyKey?: string;
  recordedAt?: number;
}

export interface RecordRefundInput {
  id?: string;
  orderId: string;
  amountMinor: number;
  method: PaymentMethod;
  originalPaymentId: string;
  reason?: string;
  idempotencyKey?: string;
}

export interface PaymentFilter {
  orderId?: string;
  status?: PaymentTxStatus;
  method?: PaymentMethod;
}

export class PaymentRepository extends BaseRepository {
  constructor(db: LaundryDatabase, context: RepositoryContext) {
    super(db, context);
  }

  public async recordPayment(input: RecordPaymentInput): Promise<Payment> {
    if (input.amountMinor <= 0 || !Number.isInteger(input.amountMinor)) {
      throw new Error('Payment amountMinor must be a positive integer');
    }

    const id = input.id ?? this.generateId();
    const now = Date.now();
    const idempotencyKey = input.idempotencyKey ?? this.generateId();

    // Critical invariant: Offline payments must NEVER be marked confirmed locally
    const payment: Payment = {
      id,
      tenantId: this.context.tenantId,
      orderId: input.orderId,
      amountMinor: input.amountMinor,
      method: input.method,
      status: 'pending',
      providerReference: input.providerReference ?? null,
      idempotencyKey,
      recordedAt: input.recordedAt ?? now,
      confirmedAt: null,
      createdAt: now,
      version: 1,
    };

    await this.db.transaction('rw', [this.db.payments, this.db.outbox], async (tx) => {
      await this.db.payments.add(payment);
      await this.createOutboxOperation(
        'payment',
        payment.id,
        'payment',
        payment as unknown as Record<string, unknown>,
        0,
        tx
      );
    });

    return payment;
  }

  public async recordRefund(input: RecordRefundInput): Promise<Payment> {
    if (input.amountMinor <= 0 || !Number.isInteger(input.amountMinor)) {
      throw new Error('Refund amountMinor must be a positive integer');
    }

    const id = input.id ?? this.generateId();
    const now = Date.now();
    const idempotencyKey = input.idempotencyKey ?? this.generateId();

    // Append-only refund transaction
    const refundRecord: Payment = {
      id,
      tenantId: this.context.tenantId,
      orderId: input.orderId,
      amountMinor: input.amountMinor,
      method: input.method,
      status: 'pending', // Pending server reconciliation
      providerReference: `refund_for:${input.originalPaymentId}${input.reason ? `:${input.reason}` : ''}`,
      idempotencyKey,
      recordedAt: now,
      confirmedAt: null,
      createdAt: now,
      version: 1,
    };

    await this.db.transaction('rw', [this.db.payments, this.db.outbox], async (tx) => {
      await this.db.payments.add(refundRecord);
      await this.createOutboxOperation(
        'payment',
        refundRecord.id,
        'payment',
        refundRecord as unknown as Record<string, unknown>,
        0,
        tx
      );
    });

    return refundRecord;
  }

  public async getById(id: string): Promise<Payment | undefined> {
    const payment = await this.db.payments.get(id);
    if (!payment || payment.tenantId !== this.context.tenantId) {
      return undefined;
    }
    return payment;
  }

  public async listByOrder(orderId: string): Promise<Payment[]> {
    const payments = await this.db.payments
      .where('orderId')
      .equals(orderId)
      .toArray();

    return payments.filter((p) => p.tenantId === this.context.tenantId);
  }

  public async list(filter?: PaymentFilter): Promise<Payment[]> {
    const results = await this.db.payments
      .where('tenantId')
      .equals(this.context.tenantId)
      .toArray();

    return results.filter((p) => {
      if (filter?.orderId && p.orderId !== filter.orderId) {
        return false;
      }
      if (filter?.status && p.status !== filter.status) {
        return false;
      }
      if (filter?.method && p.method !== filter.method) {
        return false;
      }
      return true;
    });
  }
}

