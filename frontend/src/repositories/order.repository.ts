import type {
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
} from '../domain/types';
import { isValidOrderStatusTransition } from '../domain/validation';
import { BaseRepository, type RepositoryContext } from './base.repository';
import type { LaundryDatabase } from '../database/db';
import type { CreateOrderItemInput } from './order-item.repository';

export interface CreateOrderInput {
  id?: string;
  branchId: string;
  customerId: string;
  orderNumber?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  subtotalMinor?: number;
  discountMinor?: number;
  taxMinor?: number;
  totalMinor?: number;
  notes?: string | null;
  receivedAt?: number;
  promisedAt?: number | null;
  deliveredAt?: number | null;
}

export interface UpdateOrderInput {
  notes?: string | null;
  promisedAt?: number | null;
  deliveredAt?: number | null;
  subtotalMinor?: number;
  discountMinor?: number;
  taxMinor?: number;
  totalMinor?: number;
}

export interface OrderFilter {
  branchId?: string;
  customerId?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  orderNumber?: string;
  search?: string;
  includeDeleted?: boolean;
}

export class OrderRepository extends BaseRepository {
  constructor(db: LaundryDatabase, context: RepositoryContext) {
    super(db, context);
  }

  private generateOrderNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${dateStr}-${rand}`;
  }

  public async create(
    input: CreateOrderInput,
    items?: CreateOrderItemInput[]
  ): Promise<Order> {
    const id = input.id ?? this.generateId();
    const now = Date.now();
    const orderNumber = input.orderNumber ?? this.generateOrderNumber();

    let subtotal = input.subtotalMinor ?? 0;
    if (items && items.length > 0 && input.subtotalMinor === undefined) {
      subtotal = items.reduce(
        (acc, it) =>
          acc + (it.lineTotalMinor ?? it.quantity * it.unitPriceMinor),
        0
      );
    }
    const discount = input.discountMinor ?? 0;
    const tax = input.taxMinor ?? 0;
    const total = input.totalMinor ?? Math.max(0, subtotal - discount + tax);

    const order: Order = {
      id,
      tenantId: this.context.tenantId,
      branchId: input.branchId,
      customerId: input.customerId,
      orderNumber,
      status: input.status ?? 'received',
      paymentStatus: input.paymentStatus ?? 'unpaid',
      subtotalMinor: subtotal,
      discountMinor: discount,
      taxMinor: tax,
      totalMinor: total,
      notes: input.notes?.trim() ?? null,
      receivedAt: input.receivedAt ?? now,
      promisedAt: input.promisedAt ?? null,
      deliveredAt: input.deliveredAt ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const orderItemsToInsert: OrderItem[] = (items ?? []).map((it) => {
      const lineTotal =
        it.lineTotalMinor ?? it.quantity * it.unitPriceMinor;
      return {
        id: it.id ?? this.generateId(),
        tenantId: this.context.tenantId,
        orderId: id,
        serviceId: it.serviceId,
        description: it.description.trim(),
        quantity: it.quantity,
        unitPriceMinor: it.unitPriceMinor,
        lineTotalMinor: lineTotal,
        garmentAttributes: it.garmentAttributes ?? null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
    });

    await this.db.transaction(
      'rw',
      [this.db.orders, this.db.orderItems, this.db.outbox],
      async (tx) => {
        await this.db.orders.add(order);

        for (const item of orderItemsToInsert) {
          await this.db.orderItems.add(item);
          await this.createOutboxOperation(
            'orderItem',
            item.id,
            'create',
            item as unknown as Record<string, unknown>,
            0,
            tx
          );
        }

        await this.createOutboxOperation(
          'order',
          order.id,
          'create',
          order as unknown as Record<string, unknown>,
          0,
          tx
        );
      }
    );

    return order;
  }

  public async updateStatus(
    id: string,
    newStatus: OrderStatus,
    baseVersion: number
  ): Promise<Order> {
    return await this.db.transaction(
      'rw',
      [this.db.orders, this.db.outbox],
      async (tx) => {
        const existing = await this.db.orders.get(id);
        if (!existing || existing.tenantId !== this.context.tenantId) {
          throw new Error(`Order with id ${id} not found`);
        }
        if (existing.deletedAt !== null) {
          throw new Error(`Cannot update soft-deleted order ${id}`);
        }

        if (!isValidOrderStatusTransition(existing.status, newStatus)) {
          throw new Error(
            `Invalid status transition from ${existing.status} to ${newStatus}`
          );
        }

        const now = Date.now();
        const deliveredAt =
          newStatus === 'delivered' ? now : existing.deliveredAt;

        const updated: Order = {
          ...existing,
          status: newStatus,
          deliveredAt,
          version: existing.version + 1,
          updatedAt: now,
        };

        await this.db.orders.put(updated);
        await this.createOutboxOperation(
          'order',
          updated.id,
          'status_change',
          { id, previousStatus: existing.status, newStatus, deliveredAt },
          baseVersion,
          tx
        );

        return updated;
      }
    );
  }

  public async updatePaymentStatus(
    id: string,
    newPaymentStatus: PaymentStatus,
    baseVersion: number
  ): Promise<Order> {
    return await this.db.transaction(
      'rw',
      [this.db.orders, this.db.outbox],
      async (tx) => {
        const existing = await this.db.orders.get(id);
        if (!existing || existing.tenantId !== this.context.tenantId) {
          throw new Error(`Order with id ${id} not found`);
        }
        if (existing.deletedAt !== null) {
          throw new Error(`Cannot update soft-deleted order ${id}`);
        }

        const now = Date.now();
        const updated: Order = {
          ...existing,
          paymentStatus: newPaymentStatus,
          version: existing.version + 1,
          updatedAt: now,
        };

        await this.db.orders.put(updated);
        await this.createOutboxOperation(
          'order',
          updated.id,
          'update',
          { id, paymentStatus: newPaymentStatus },
          baseVersion,
          tx
        );

        return updated;
      }
    );
  }

  public async update(
    id: string,
    input: UpdateOrderInput,
    baseVersion: number
  ): Promise<Order> {
    return await this.db.transaction(
      'rw',
      [this.db.orders, this.db.outbox],
      async (tx) => {
        const existing = await this.db.orders.get(id);
        if (!existing || existing.tenantId !== this.context.tenantId) {
          throw new Error(`Order with id ${id} not found`);
        }
        if (existing.deletedAt !== null) {
          throw new Error(`Cannot update soft-deleted order ${id}`);
        }

        const now = Date.now();
        const updated: Order = {
          ...existing,
          ...input,
          notes: input.notes !== undefined ? (input.notes?.trim() ?? null) : existing.notes,
          version: existing.version + 1,
          updatedAt: now,
        };

        await this.db.orders.put(updated);
        await this.createOutboxOperation(
          'order',
          updated.id,
          'update',
          input as unknown as Record<string, unknown>,
          baseVersion,
          tx
        );

        return updated;
      }
    );
  }

  public async getById(id: string): Promise<Order | undefined> {
    const order = await this.db.orders.get(id);
    if (!order || order.tenantId !== this.context.tenantId) {
      return undefined;
    }
    return order;
  }

  public async getWithItems(
    id: string
  ): Promise<{ order: Order; items: OrderItem[] } | undefined> {
    const order = await this.getById(id);
    if (!order) return undefined;

    const items = await this.db.orderItems
      .where('orderId')
      .equals(id)
      .toArray();

    return {
      order,
      items: items.filter(
        (it) => it.tenantId === this.context.tenantId && it.deletedAt === null
      ),
    };
  }

  public async list(filter?: OrderFilter): Promise<Order[]> {
    const results = await this.db.orders
      .where('tenantId')
      .equals(this.context.tenantId)
      .toArray();

    return results.filter((o) => {
      if (!filter?.includeDeleted && o.deletedAt !== null) {
        return false;
      }
      if (filter?.branchId && o.branchId !== filter.branchId) {
        return false;
      }
      if (filter?.customerId && o.customerId !== filter.customerId) {
        return false;
      }
      if (filter?.status && o.status !== filter.status) {
        return false;
      }
      if (filter?.paymentStatus && o.paymentStatus !== filter.paymentStatus) {
        return false;
      }
      if (filter?.orderNumber && !o.orderNumber.includes(filter.orderNumber)) {
        return false;
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        const matchesNum = o.orderNumber.toLowerCase().includes(q);
        const matchesNotes = o.notes?.toLowerCase().includes(q) ?? false;
        if (!matchesNum && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  }

  public async softDelete(id: string, baseVersion: number): Promise<void> {
    await this.db.transaction('rw', [this.db.orders, this.db.outbox], async (tx) => {
      const existing = await this.db.orders.get(id);
      if (!existing || existing.tenantId !== this.context.tenantId) {
        throw new Error(`Order with id ${id} not found`);
      }
      if (existing.deletedAt !== null) {
        return;
      }

      const now = Date.now();
      const updated: Order = {
        ...existing,
        version: existing.version + 1,
        updatedAt: now,
        deletedAt: now,
      };

      await this.db.orders.put(updated);
      await this.createOutboxOperation(
        'order',
        id,
        'delete',
        { id, deletedAt: now },
        baseVersion,
        tx
      );
    });
  }

  public async delete(id: string, baseVersion: number): Promise<void> {
    await this.softDelete(id, baseVersion);
  }
}

