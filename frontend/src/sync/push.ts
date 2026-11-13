import type { LaundryDatabase } from '../database/db';
import type {
  OutboxEntity,
  OutboxOperation,
  SyncConflictRecord,
} from '../domain/types';

export interface BatchPushResult {
  acknowledged: string[];
  conflicts?: Array<{
    operationId: string;
    entity: OutboxEntity;
    entityId: string;
    baseVersion: number;
    serverVersion: number;
    serverPayload: Record<string, unknown>;
    message?: string;
  }>;
  errors?: Array<{
    operationId: string;
    error: string;
    canRetry?: boolean;
  }>;
}

export type BatchTransportFn = (
  operations: OutboxOperation[]
) => Promise<BatchPushResult>;

export interface OutboxPushOptions {
  batchSize?: number;
  inFlightTimeoutMs?: number;
}

export const DEFAULT_PUSH_OPTIONS: Required<OutboxPushOptions> = {
  batchSize: 25,
  inFlightTimeoutMs: 60_000,
};

/**
 * Builds a bounded, strictly ordered batch of outbox operations while respecting
 * FIFO ordering and cross-entity dependencies.
 */
export function buildOrderedBatch(
  allPending: OutboxOperation[],
  maxBatchSize: number
): OutboxOperation[] {
  // Sort strictly by createdAt ascending
  const sorted = [...allPending].sort((a, b) => a.createdAt - b.createdAt);

  const batch: OutboxOperation[] = [];
  const selectedOpIds = new Set<string>();
  const entityBlocked = new Set<string>(); // "entity:entityId" that cannot advance out of order

  for (const op of sorted) {
    if (batch.length >= maxBatchSize) {
      break;
    }

    const entityKey = `${op.entity}:${op.entityId}`;

    // If an earlier operation on this entity was blocked or failed, wait for it
    if (entityBlocked.has(entityKey)) {
      continue;
    }

    // Check parent entity dependencies (e.g. orderItem or payment dependent on order creation)
    if (op.entity === 'orderItem' || op.entity === 'payment') {
      const orderId = (op.payload as { orderId?: string })?.orderId;
      if (orderId) {
        const orderKey = `order:${orderId}`;
        const hasPendingOrderCreate = sorted.some(
          (o) =>
            o.entity === 'order' &&
            o.entityId === orderId &&
            o.action === 'create' &&
            !selectedOpIds.has(o.operationId) &&
            o.createdAt < op.createdAt
        );

        // If the order creation hasn't been included yet, we must not push item/payment before it
        if (hasPendingOrderCreate) {
          entityBlocked.add(entityKey);
          continue;
        }
      }
    }

    batch.push(op);
    selectedOpIds.add(op.operationId);
  }

  return batch;
}

export class OutboxPushEngine {
  private db: LaundryDatabase;
  private tenantId: string;
  private options: Required<OutboxPushOptions>;

  constructor(
    db: LaundryDatabase,
    tenantId: string,
    options: OutboxPushOptions = {}
  ) {
    this.db = db;
    this.tenantId = tenantId;
    this.options = { ...DEFAULT_PUSH_OPTIONS, ...options };
  }

  /**
   * Recovers operations stuck in 'in_flight' due to tab closes or crashes.
   */
  public async recoverStuckInFlight(maxAgeMs = this.options.inFlightTimeoutMs): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let recoveredCount = 0;

    await this.db.transaction('rw', this.db.outbox, async () => {
      const stuckOps = await this.db.outbox
        .where('tenantId')
        .equals(this.tenantId)
        .toArray();

      for (const op of stuckOps) {
        if (op.status === 'in_flight' && op.createdAt <= cutoff) {
          await this.db.outbox.update(op.operationId, {
            status: 'pending',
            lastError: 'Reset after in-flight timeout',
          });
          recoveredCount++;
        }
      }
    });

    return recoveredCount;
  }

  /**
   * Fetches the next ordered batch of operations and marks them 'in_flight'.
   */
  public async claimNextBatch(limit = this.options.batchSize): Promise<OutboxOperation[]> {
    return await this.db.transaction('rw', this.db.outbox, async () => {
      const candidates = await this.db.outbox
        .where('tenantId')
        .equals(this.tenantId)
        .toArray();

      // Only candidate for push if status is 'pending'
      const pending = candidates.filter((op) => op.status === 'pending');
      const batch = buildOrderedBatch(pending, limit);

      for (const op of batch) {
        op.status = 'in_flight';
        await this.db.outbox.update(op.operationId, { status: 'in_flight' });
      }

      return batch;
    });
  }

  /**
   * Processes server response for a pushed batch:
   * - Acknowledged: deleted from outbox.
   * - Conflicts: recorded in conflicts table, marked failed.
   * - Errors: marked failed with retry count incremented.
   * - Unmentioned: reverted to pending.
   */
  public async processBatchResponse(
    sentOps: OutboxOperation[],
    response: BatchPushResult
  ): Promise<{
    acknowledgedCount: number;
    conflictCount: number;
    errorCount: number;
  }> {
    const ackSet = new Set(response.acknowledged);
    const conflictMap = new Map(
      (response.conflicts ?? []).map((c) => [c.operationId, c])
    );
    const errorMap = new Map(
      (response.errors ?? []).map((e) => [e.operationId, e])
    );

    let acknowledgedCount = 0;
    let conflictCount = 0;
    let errorCount = 0;

    await this.db.transaction(
      'rw',
      [this.db.outbox, this.db.conflicts],
      async () => {
        for (const op of sentOps) {
          if (ackSet.has(op.operationId)) {
            // Server has authoritatively accepted the mutation.
            // Delete from outbox. (Never overwrite newer local entity edits!)
            await this.db.outbox.delete(op.operationId);
            acknowledgedCount++;
          } else if (conflictMap.has(op.operationId)) {
            const conflict = conflictMap.get(op.operationId)!;
            const conflictRecord: SyncConflictRecord = {
              id: crypto.randomUUID(),
              tenantId: this.tenantId,
              entity: conflict.entity,
              entityId: conflict.entityId,
              operationId: op.operationId,
              baseVersion: conflict.baseVersion,
              serverVersion: conflict.serverVersion,
              localPayload: op.payload,
              serverPayload: conflict.serverPayload,
              resolved: false,
              resolvedAt: null,
              resolution: null,
              createdAt: Date.now(),
            };

            await this.db.conflicts.put(conflictRecord);
            await this.db.outbox.update(op.operationId, {
              status: 'failed',
              lastError: conflict.message ?? 'Version conflict detected',
              retryCount: op.retryCount + 1,
            });
            conflictCount++;
          } else if (errorMap.has(op.operationId)) {
            const error = errorMap.get(op.operationId)!;
            await this.db.outbox.update(op.operationId, {
              status: 'failed',
              lastError: error.error,
              retryCount: op.retryCount + 1,
            });
            errorCount++;
          } else {
            // Unacknowledged (e.g. partial response or server skipped):
            // Revert back to pending so it can be retried safely
            await this.db.outbox.update(op.operationId, {
              status: 'pending',
            });
          }
        }
      }
    );

    return { acknowledgedCount, conflictCount, errorCount };
  }

  /**
   * Executes a complete push cycle:
   * 1. Claims ordered batch.
   * 2. Dispatches via transport.
   * 3. Processes partial acks, conflicts, and errors.
   */
  public async pushBatch(transport: BatchTransportFn): Promise<{
    processed: boolean;
    batchSize: number;
    acknowledgedCount: number;
    conflictCount: number;
    errorCount: number;
  }> {
    const batch = await this.claimNextBatch();
    if (batch.length === 0) {
      return {
        processed: false,
        batchSize: 0,
        acknowledgedCount: 0,
        conflictCount: 0,
        errorCount: 0,
      };
    }

    try {
      const response = await transport(batch);
      const results = await this.processBatchResponse(batch, response);
      return {
        processed: true,
        batchSize: batch.length,
        ...results,
      };
    } catch (networkError) {
      // Revert batch back to pending on connection failure so they can retry
      const errMsg =
        networkError instanceof Error ? networkError.message : String(networkError);

      await this.db.transaction('rw', this.db.outbox, async () => {
        for (const op of batch) {
          await this.db.outbox.update(op.operationId, {
            status: 'pending',
            lastError: `Transport failure: ${errMsg}`,
          });
        }
      });

      throw networkError;
    }
  }
}
