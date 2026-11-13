import type { PricingUnit, Service } from '../domain/types';
import { BaseRepository, type RepositoryContext } from './base.repository';
import type { LaundryDatabase } from '../database/db';

export interface CreateServiceInput {
  id?: string;
  name: string;
  description?: string | null;
  pricingUnit: PricingUnit;
  unitPriceMinor: number;
  isActive?: boolean;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string | null;
  pricingUnit?: PricingUnit;
  unitPriceMinor?: number;
  isActive?: boolean;
}

export interface ServiceFilter {
  isActive?: boolean;
  pricingUnit?: PricingUnit;
  search?: string;
  includeDeleted?: boolean;
}

export class ServiceRepository extends BaseRepository {
  constructor(db: LaundryDatabase, context: RepositoryContext) {
    super(db, context);
  }

  public async create(input: CreateServiceInput): Promise<Service> {
    if (input.unitPriceMinor < 0 || !Number.isInteger(input.unitPriceMinor)) {
      throw new Error('unitPriceMinor must be a non-negative integer');
    }

    const id = input.id ?? this.generateId();
    const now = Date.now();

    const service: Service = {
      id,
      tenantId: this.context.tenantId,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      pricingUnit: input.pricingUnit,
      unitPriceMinor: input.unitPriceMinor,
      isActive: input.isActive ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.db.transaction('rw', [this.db.services, this.db.outbox], async (tx) => {
      await this.db.services.add(service);
      await this.createOutboxOperation(
        'service',
        service.id,
        'create',
        service as unknown as Record<string, unknown>,
        0,
        tx
      );
    });

    return service;
  }

  public async update(
    id: string,
    input: UpdateServiceInput,
    baseVersion: number
  ): Promise<Service> {
    if (
      input.unitPriceMinor !== undefined &&
      (input.unitPriceMinor < 0 || !Number.isInteger(input.unitPriceMinor))
    ) {
      throw new Error('unitPriceMinor must be a non-negative integer');
    }

    return await this.db.transaction(
      'rw',
      [this.db.services, this.db.outbox],
      async (tx) => {
        const existing = await this.db.services.get(id);
        if (!existing || existing.tenantId !== this.context.tenantId) {
          throw new Error(`Service with id ${id} not found`);
        }
        if (existing.deletedAt !== null) {
          throw new Error(`Cannot update soft-deleted service ${id}`);
        }

        const now = Date.now();
        const updated: Service = {
          ...existing,
          ...input,
          name: input.name !== undefined ? input.name.trim() : existing.name,
          description: input.description !== undefined ? (input.description?.trim() ?? null) : existing.description,
          pricingUnit: input.pricingUnit ?? existing.pricingUnit,
          unitPriceMinor: input.unitPriceMinor ?? existing.unitPriceMinor,
          isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
          version: existing.version + 1,
          updatedAt: now,
        };

        await this.db.services.put(updated);
        await this.createOutboxOperation(
          'service',
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

  public async getById(id: string): Promise<Service | undefined> {
    const service = await this.db.services.get(id);
    if (!service || service.tenantId !== this.context.tenantId) {
      return undefined;
    }
    return service;
  }

  public async list(filter?: ServiceFilter): Promise<Service[]> {
    const results = await this.db.services
      .where('tenantId')
      .equals(this.context.tenantId)
      .toArray();

    return results.filter((s) => {
      if (!filter?.includeDeleted && s.deletedAt !== null) {
        return false;
      }
      if (filter?.isActive !== undefined && s.isActive !== filter.isActive) {
        return false;
      }
      if (filter?.pricingUnit !== undefined && s.pricingUnit !== filter.pricingUnit) {
        return false;
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesDesc = s.description?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesDesc) {
          return false;
        }
      }
      return true;
    });
  }

  public async softDelete(id: string, baseVersion: number): Promise<void> {
    await this.db.transaction('rw', [this.db.services, this.db.outbox], async (tx) => {
      const existing = await this.db.services.get(id);
      if (!existing || existing.tenantId !== this.context.tenantId) {
        throw new Error(`Service with id ${id} not found`);
      }
      if (existing.deletedAt !== null) {
        return;
      }

      const now = Date.now();
      const updated: Service = {
        ...existing,
        version: existing.version + 1,
        updatedAt: now,
        deletedAt: now,
      };

      await this.db.services.put(updated);
      await this.createOutboxOperation(
        'service',
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

