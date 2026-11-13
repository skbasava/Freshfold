import type { Transaction } from 'dexie';
import type {
  OutboxAction,
  OutboxEntity,
  OutboxOperation,
  OutboxStatus,
} from '../domain/types';
import { BaseRepository, getMonotonicNow, type RepositoryContext } from './base.repository';
import type { LaundryDatabase } from '../database/db';

export interface CreateOutboxInput<TPayload = Record<string, unknown>> {
  operationId?: string;
  entity: OutboxEntity;
  entityId: string;
  action: OutboxAction;
  payload: TPayload;
  baseVersion: number;
}

export interface OutboxFilter {
  status?: OutboxStatus;
  entity?: OutboxEntity;
}

export class OutboxRepository extends BaseRepository {
  constructor(db: LaundryDatabase, context: RepositoryContext) {
    super(db, context);
  }

  public async add<TPayload extends Record<string, unknown>>(
    input: CreateOutboxInput<TPayload>,
    tx?: Transaction
  ): Promise<OutboxOperation<TPayload>> {
    const operation: OutboxOperation<TPayload> = {
      operationId: input.operationId ?? this.generateId(),
      tenantId: this.context.tenantId,
      deviceId: this.context.deviceId,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      payload: input.payload,
      baseVersion: input.baseVersion,
      createdAt: getMonotonicNow(),
      retryCount: 0,
      status: 'pending',
      lastError: null,
    };

    if (tx) {
      await tx.table<OutboxOperation, string>('outbox').put(operation as OutboxOperation);
    } else {
      await this.db.outbox.put(operation as OutboxOperation);
    }

    return operation;
  }

  public async getPending(limit = 50): Promise<OutboxOperation[]> {
    const operations = await this.db.outbox
      .where('tenantId')
      .equals(this.context.tenantId)
      .toArray();

    return operations
      .filter((op) => op.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit);
  }

  public async markInFlight(operationIds: string[]): Promise<void> {
    if (operationIds.length === 0) return;
    const idSet = new Set(operationIds);

    await this.db.transaction('rw', this.db.outbox, async () => {
      const ops = await this.db.outbox
        .where('tenantId')
        .equals(this.context.tenantId)
        .toArray();

      for (const op of ops) {
        if (idSet.has(op.operationId) && op.status === 'pending') {
          await this.db.outbox.update(op.operationId, { status: 'in_flight' });
        }
      }
    });
  }

  public async markFailed(operationId: string, error: string): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, async () => {
      const op = await this.db.outbox.get(operationId);
      if (op && op.tenantId === this.context.tenantId) {
        await this.db.outbox.update(operationId, {
          status: 'failed',
          retryCount: op.retryCount + 1,
          lastError: error,
        });
      }
    });
  }

  public async markAcknowledged(operationId: string): Promise<void> {
    await this.db.transaction('rw', this.db.outbox, async () => {
      const op = await this.db.outbox.get(operationId);
      if (op && op.tenantId === this.context.tenantId) {
        // Safe removal upon explicit server acknowledgement
        await this.db.outbox.delete(operationId);
      }
    });
  }

  public async markBatchAcknowledged(operationIds: string[]): Promise<void> {
    if (operationIds.length === 0) return;
    await this.db.transaction('rw', this.db.outbox, async () => {
      for (const id of operationIds) {
        const op = await this.db.outbox.get(id);
        if (op && op.tenantId === this.context.tenantId) {
          await this.db.outbox.delete(id);
        }
      }
    });
  }

  public async resetInFlight(): Promise<number> {
    let count = 0;
    await this.db.transaction('rw', this.db.outbox, async () => {
      const ops = await this.db.outbox
        .where('tenantId')
        .equals(this.context.tenantId)
        .toArray();

      for (const op of ops) {
        if (op.status === 'in_flight') {
          await this.db.outbox.update(op.operationId, { status: 'pending' });
          count++;
        }
      }
    });
    return count;
  }

  public async getById(operationId: string): Promise<OutboxOperation | undefined> {
    const op = await this.db.outbox.get(operationId);
    if (!op || op.tenantId !== this.context.tenantId) {
      return undefined;
    }
    return op;
  }

  public async countPending(): Promise<number> {
    const ops = await this.db.outbox
      .where('tenantId')
      .equals(this.context.tenantId)
      .toArray();

    return ops.filter((op) => op.status === 'pending').length;
  }

  public async list(filter?: OutboxFilter): Promise<OutboxOperation[]> {
    const results = await this.db.outbox
      .where('tenantId')
      .equals(this.context.tenantId)
      .toArray();

    return results
      .filter((op) => {
        if (filter?.status && op.status !== filter.status) {
          return false;
        }
        if (filter?.entity && op.entity !== filter.entity) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.createdAt - b.createdAt);
  }
}

