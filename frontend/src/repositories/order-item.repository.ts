import type { GarmentAttributes, OrderItem } from '../domain/types';
import { BaseRepository, type RepositoryContext } from './base.repository';
import type { LaundryDatabase } from '../database/db';

export interface CreateOrderItemInput {
  id?: string;
  orderId: string;
  serviceId: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor?: number;
  garmentAttributes?: GarmentAttributes;
}

export interface UpdateOrderItemInput {
  description?: string;
  quantity?: number;
  unitPriceMinor?: number;
  lineTotalMinor?: number;
  garmentAttributes?: GarmentAttributes;
}

export class OrderItemRepository extends BaseRepository {
  constructor(db: LaundryDatabase, context: RepositoryContext) {
    super(db, context);
  }

  public async create(input: CreateOrderItemInput): Promise<OrderItem> {
    if (input.quantity <= 0 || !Number.isInteger(input.quantity)) {
      throw new Error('quantity must be a positive integer');
    }
    if (input.unitPriceMinor < 0 || !Number.isInteger(input.unitPriceMinor)) {
      throw new Error('unitPriceMinor must be a non-negative integer');
    }

    const id = input.id ?? this.generateId();
    const now = Date.now();
    const lineTotalMinor =
      input.lineTotalMinor ?? input.quantity * input.unitPriceMinor;

    const item: OrderItem = {
      id,
      tenantId: this.context.tenantId,
      orderId: input.orderId,
      serviceId: input.serviceId,
      description: input.description.trim(),
      quantity: input.quantity,
      unitPriceMinor: input.unitPriceMinor,
      lineTotalMinor,
      garmentAttributes: input.garmentAttributes ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.db.transaction('rw', [this.db.orderItems, this.db.outbox], async (tx) => {
      await this.db.orderItems.add(item);
      await this.createOutboxOperation(
        'orderItem',
        item.id,
        'create',
        item as unknown as Record<string, unknown>,
        0,
        tx
      );
    });

    return item;
  }

  public async update(
    id: string,
    input: UpdateOrderItemInput,
    baseVersion: number
  ): Promise<OrderItem> {
    return await this.db.transaction(
      'rw',
      [this.db.orderItems, this.db.outbox],
      async (tx) => {
        const existing = await this.db.orderItems.get(id);
        if (!existing || existing.tenantId !== this.context.tenantId) {
          throw new Error(`OrderItem with id ${id} not found`);
        }
        if (existing.deletedAt !== null) {
          throw new Error(`Cannot update soft-deleted order item ${id}`);
        }

        const quantity = input.quantity ?? existing.quantity;
        const unitPriceMinor = input.unitPriceMinor ?? existing.unitPriceMinor;
        const lineTotalMinor =
          input.lineTotalMinor ?? quantity * unitPriceMinor;

        const now = Date.now();
        const updated: OrderItem = {
          ...existing,
          description: input.description !== undefined ? input.description.trim() : existing.description,
          quantity,
          unitPriceMinor,
          lineTotalMinor,
          garmentAttributes:
            input.garmentAttributes !== undefined
              ? input.garmentAttributes
              : existing.garmentAttributes,
          version: existing.version + 1,
          updatedAt: now,
        };

        await this.db.orderItems.put(updated);
        await this.createOutboxOperation(
          'orderItem',
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

  public async getById(id: string): Promise<OrderItem | undefined> {
    const item = await this.db.orderItems.get(id);
    if (!item || item.tenantId !== this.context.tenantId) {
      return undefined;
    }
    return item;
  }

  public async listByOrder(
    orderId: string,
    includeDeleted = false
  ): Promise<OrderItem[]> {
    const items = await this.db.orderItems
      .where('orderId')
      .equals(orderId)
      .toArray();

    return items.filter(
      (item) =>
        item.tenantId === this.context.tenantId &&
        (includeDeleted || item.deletedAt === null)
    );
  }

  public async softDelete(id: string, baseVersion: number): Promise<void> {
    await this.db.transaction('rw', [this.db.orderItems, this.db.outbox], async (tx) => {
      const existing = await this.db.orderItems.get(id);
      if (!existing || existing.tenantId !== this.context.tenantId) {
        throw new Error(`OrderItem with id ${id} not found`);
      }
      if (existing.deletedAt !== null) {
        return;
      }

      const now = Date.now();
      const updated: OrderItem = {
        ...existing,
        version: existing.version + 1,
        updatedAt: now,
        deletedAt: now,
      };

      await this.db.orderItems.put(updated);
      await this.createOutboxOperation(
        'orderItem',
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

