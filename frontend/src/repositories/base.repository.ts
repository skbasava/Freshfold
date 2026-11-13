import type { Transaction } from 'dexie';
import type { LaundryDatabase } from '../database/db';
import type {
  OutboxAction,
  OutboxEntity,
  OutboxOperation,
} from '../domain/types';

export interface RepositoryContext {
  tenantId: string;
  deviceId: string;
}

let lastMonotonicTime = 0;

export function getMonotonicNow(): number {
  const now = Date.now();
  if (now <= lastMonotonicTime) {
    lastMonotonicTime++;
  } else {
    lastMonotonicTime = now;
  }
  return lastMonotonicTime;
}

export abstract class BaseRepository {
  protected readonly db: LaundryDatabase;
  protected context: RepositoryContext;

  constructor(db: LaundryDatabase, context: RepositoryContext) {
    this.db = db;
    this.context = context;
  }

  public setContext(context: RepositoryContext): void {
    this.context = context;
  }

  public getContext(): RepositoryContext {
    return { ...this.context };
  }

  protected generateId(): string {
    return crypto.randomUUID();
  }

  protected async createOutboxOperation<T extends Record<string, unknown>>(
    entity: OutboxEntity,
    entityId: string,
    action: OutboxAction,
    payload: T,
    baseVersion: number,
    tx?: Transaction
  ): Promise<OutboxOperation<T>> {
    const operation: OutboxOperation<T> = {
      operationId: this.generateId(),
      tenantId: this.context.tenantId,
      deviceId: this.context.deviceId,
      entity,
      entityId,
      action,
      payload,
      baseVersion,
      createdAt: getMonotonicNow(),
      retryCount: 0,
      status: 'pending',
      lastError: null,
    };

    if (tx) {
      await tx.table<OutboxOperation, string>('outbox').put(operation);
    } else {
      await this.db.outbox.put(operation);
    }

    return operation;
  }
}

