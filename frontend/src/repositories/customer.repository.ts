import type { Customer } from '../domain/types';
import { BaseRepository, type RepositoryContext } from './base.repository';
import type { LaundryDatabase } from '../database/db';

export interface CreateCustomerInput {
  id?: string;
  branchId: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string;
  email?: string | null;
  notes?: string | null;
  branchId?: string;
}

export interface CustomerFilter {
  branchId?: string;
  search?: string;
  includeDeleted?: boolean;
}

export class CustomerRepository extends BaseRepository {
  constructor(db: LaundryDatabase, context: RepositoryContext) {
    super(db, context);
  }

  public async create(input: CreateCustomerInput): Promise<Customer> {
    const id = input.id ?? this.generateId();
    const now = Date.now();

    const customer: Customer = {
      id,
      tenantId: this.context.tenantId,
      branchId: input.branchId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() ?? null,
      notes: input.notes?.trim() ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.db.transaction('rw', [this.db.customers, this.db.outbox], async (tx) => {
      await this.db.customers.add(customer);
      await this.createOutboxOperation(
        'customer',
        customer.id,
        'create',
        customer as unknown as Record<string, unknown>,
        0,
        tx
      );
    });

    return customer;
  }

  public async update(
    id: string,
    input: UpdateCustomerInput,
    baseVersion: number
  ): Promise<Customer> {
    return await this.db.transaction(
      'rw',
      [this.db.customers, this.db.outbox],
      async (tx) => {
        const existing = await this.db.customers.get(id);
        if (!existing || existing.tenantId !== this.context.tenantId) {
          throw new Error(`Customer with id ${id} not found`);
        }
        if (existing.deletedAt !== null) {
          throw new Error(`Cannot update soft-deleted customer ${id}`);
        }

        const now = Date.now();
        const updated: Customer = {
          ...existing,
          ...input,
          name: input.name !== undefined ? input.name.trim() : existing.name,
          phone: input.phone !== undefined ? input.phone.trim() : existing.phone,
          email: input.email !== undefined ? (input.email?.trim() ?? null) : existing.email,
          notes: input.notes !== undefined ? (input.notes?.trim() ?? null) : existing.notes,
          version: existing.version + 1,
          updatedAt: now,
        };

        await this.db.customers.put(updated);
        await this.createOutboxOperation(
          'customer',
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

  public async getById(id: string): Promise<Customer | undefined> {
    const customer = await this.db.customers.get(id);
    if (!customer || customer.tenantId !== this.context.tenantId) {
      return undefined;
    }
    return customer;
  }

  public async list(filter?: CustomerFilter): Promise<Customer[]> {
    let collection = this.db.customers
      .where('tenantId')
      .equals(this.context.tenantId);

    const results = await collection.toArray();

    return results.filter((c) => {
      if (!filter?.includeDeleted && c.deletedAt !== null) {
        return false;
      }
      if (filter?.branchId && c.branchId !== filter.branchId) {
        return false;
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesPhone = c.phone.includes(q);
        const matchesEmail = c.email?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesPhone && !matchesEmail) {
          return false;
        }
      }
      return true;
    });
  }

  public async softDelete(id: string, baseVersion: number): Promise<void> {
    await this.db.transaction('rw', [this.db.customers, this.db.outbox], async (tx) => {
      const existing = await this.db.customers.get(id);
      if (!existing || existing.tenantId !== this.context.tenantId) {
        throw new Error(`Customer with id ${id} not found`);
      }
      if (existing.deletedAt !== null) {
        return; // already deleted
      }

      const now = Date.now();
      const updated: Customer = {
        ...existing,
        version: existing.version + 1,
        updatedAt: now,
        deletedAt: now,
      };

      await this.db.customers.put(updated);
      await this.createOutboxOperation(
        'customer',
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

