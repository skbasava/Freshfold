import type { Branch } from '../domain/types';
import { BaseRepository, type RepositoryContext } from './base.repository';
import type { LaundryDatabase } from '../database/db';

export interface CreateBranchInput {
  id?: string;
  name: string;
  code: string;
  address: string;
  isActive?: boolean;
}

export interface UpdateBranchInput {
  name?: string;
  code?: string;
  address?: string;
  isActive?: boolean;
}

export interface BranchFilter {
  isActive?: boolean;
  search?: string;
  includeDeleted?: boolean;
}

export class BranchRepository extends BaseRepository {
  constructor(db: LaundryDatabase, context: RepositoryContext) {
    super(db, context);
  }

  public async create(input: CreateBranchInput): Promise<Branch> {
    const id = input.id ?? this.generateId();
    const now = Date.now();

    const branch: Branch = {
      id,
      tenantId: this.context.tenantId,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      address: input.address.trim(),
      isActive: input.isActive ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.db.transaction('rw', [this.db.branches, this.db.outbox], async (tx) => {
      await this.db.branches.add(branch);
      await this.createOutboxOperation(
        'branch',
        branch.id,
        'create',
        branch as unknown as Record<string, unknown>,
        0,
        tx
      );
    });

    return branch;
  }

  public async update(
    id: string,
    input: UpdateBranchInput,
    baseVersion: number
  ): Promise<Branch> {
    return await this.db.transaction(
      'rw',
      [this.db.branches, this.db.outbox],
      async (tx) => {
        const existing = await this.db.branches.get(id);
        if (!existing || existing.tenantId !== this.context.tenantId) {
          throw new Error(`Branch with id ${id} not found`);
        }
        if (existing.deletedAt !== null) {
          throw new Error(`Cannot update soft-deleted branch ${id}`);
        }

        const now = Date.now();
        const updated: Branch = {
          ...existing,
          ...input,
          name: input.name !== undefined ? input.name.trim() : existing.name,
          code: input.code !== undefined ? input.code.trim().toUpperCase() : existing.code,
          address: input.address !== undefined ? input.address.trim() : existing.address,
          isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
          version: existing.version + 1,
          updatedAt: now,
        };

        await this.db.branches.put(updated);
        await this.createOutboxOperation(
          'branch',
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

  public async getById(id: string): Promise<Branch | undefined> {
    const branch = await this.db.branches.get(id);
    if (!branch || branch.tenantId !== this.context.tenantId) {
      return undefined;
    }
    return branch;
  }

  public async list(filter?: BranchFilter): Promise<Branch[]> {
    const results = await this.db.branches
      .where('tenantId')
      .equals(this.context.tenantId)
      .toArray();

    return results.filter((b) => {
      if (!filter?.includeDeleted && b.deletedAt !== null) {
        return false;
      }
      if (filter?.isActive !== undefined && b.isActive !== filter.isActive) {
        return false;
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        const matchesName = b.name.toLowerCase().includes(q);
        const matchesCode = b.code.toLowerCase().includes(q);
        if (!matchesName && !matchesCode) {
          return false;
        }
      }
      return true;
    });
  }

  public async softDelete(id: string, baseVersion: number): Promise<void> {
    await this.db.transaction('rw', [this.db.branches, this.db.outbox], async (tx) => {
      const existing = await this.db.branches.get(id);
      if (!existing || existing.tenantId !== this.context.tenantId) {
        throw new Error(`Branch with id ${id} not found`);
      }
      if (existing.deletedAt !== null) {
        return;
      }

      const now = Date.now();
      const updated: Branch = {
        ...existing,
        version: existing.version + 1,
        updatedAt: now,
        deletedAt: now,
      };

      await this.db.branches.put(updated);
      await this.createOutboxOperation(
        'branch',
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

