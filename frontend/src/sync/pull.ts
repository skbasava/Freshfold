import type { Table } from 'dexie';
import type { LaundryDatabase } from '../database/db';
import type {
  SyncChangeItem,
  SyncEntity,
  SyncPullResponse,
} from '../../../packages/contracts/src/sync';
import type {
  SyncConflictRecord,
  SyncStateRecord,
} from '../domain/types';
import { syncEvents } from './sync-events';

export interface PullEngineOptions {
  batchSize?: number;
  branchId?: string;
  datasets?: string[];
}

export const DEFAULT_PULL_OPTIONS: Required<PullEngineOptions> = {
  batchSize: 100,
  branchId: '',
  datasets: ['customers', 'branches', 'services', 'orders', 'orderItems', 'payments'],
};

export type PullTransportFn = (query: {
  cursor: number;
  dataset?: string;
  branchId?: string;
  limit: number;
}) => Promise<SyncPullResponse>;

export class PullEngine {
  private db: LaundryDatabase;
  private tenantId: string;
  private options: Required<PullEngineOptions>;

  constructor(
    db: LaundryDatabase,
    tenantId: string,
    options: PullEngineOptions = {}
  ) {
    this.db = db;
    this.tenantId = tenantId;
    this.options = {
      batchSize: options.batchSize ?? DEFAULT_PULL_OPTIONS.batchSize,
      branchId: options.branchId ?? DEFAULT_PULL_OPTIONS.branchId,
      datasets: options.datasets ?? DEFAULT_PULL_OPTIONS.datasets,
    };
  }

  private getTableForEntity(entity: SyncEntity): Table<any, string> | null {
    switch (entity) {
      case 'customer':
        return this.db.customers;
      case 'order':
        return this.db.orders;
      case 'orderItem':
        return this.db.orderItems;
      case 'service':
        return this.db.services;
      case 'branch':
        return this.db.branches;
      case 'payment':
        return this.db.payments;
      case 'tenant':
        return this.db.tenants;
      case 'device':
        return this.db.devices;
      default:
        return null;
    }
  }

  private getAllEntityTables(): Table<any, string>[] {
    return [
      this.db.customers,
      this.db.orders,
      this.db.orderItems,
      this.db.services,
      this.db.branches,
      this.db.payments,
      this.db.tenants,
      this.db.devices,
      this.db.outbox,
      this.db.conflicts,
      this.db.syncState,
    ];
  }

  /**
   * Reads the current cursor for a dataset from Dexie.
   */
  public async getCursor(datasetKey: string): Promise<number> {
    const id = `${this.tenantId}:${datasetKey}`;
    const record = await this.db.syncState.get(id);
    return record?.lastCursor ?? 0;
  }

  /**
   * Applies a batch of incoming remote changes atomically, advancing the cursor.
   * Preserves unpushed local edits by recording conflicts instead of overwriting.
   */
  public async applyChangesBatch(
    changes: SyncChangeItem[],
    datasetKey: string,
    nextCursor: number
  ): Promise<{ applied: number; conflicts: number }> {
    let applied = 0;
    let conflicts = 0;

    await this.db.transaction('rw', this.getAllEntityTables(), async () => {
      for (const change of changes) {
        const table = this.getTableForEntity(change.entity);
        if (!table) {
          continue;
        }

        // Check if there are unpushed local edits for this entity
        const pendingOps = await this.db.outbox
          .where('tenantId')
          .equals(this.tenantId)
          .filter(
            (op) =>
              op.entity === change.entity &&
              op.entityId === change.entityId &&
              (op.status === 'pending' || op.status === 'in_flight')
          )
          .toArray();

        if (pendingOps.length > 0) {
          // Unpushed local edit exists!
          const pendingOp = pendingOps[0];

          // If the incoming server version diverges from our baseVersion, record a conflict
          if (change.version > pendingOp.baseVersion) {
            const conflictRecord: SyncConflictRecord = {
              id: crypto.randomUUID(),
              tenantId: this.tenantId,
              entity: change.entity,
              entityId: change.entityId,
              operationId: pendingOp.operationId,
              baseVersion: pendingOp.baseVersion,
              serverVersion: change.version,
              localPayload: (pendingOp.payload as Record<string, unknown>) ?? {},
              serverPayload: change.payload ?? {},
              resolved: false,
              resolvedAt: null,
              resolution: null,
              createdAt: Date.now(),
            };

            await this.db.conflicts.put(conflictRecord);
            conflicts++;

            syncEvents.emit('sync:conflict', {
              conflictId: conflictRecord.id,
              entity: change.entity,
              entityId: change.entityId,
              baseVersion: pendingOp.baseVersion,
              serverVersion: change.version,
            });

            // Do not overwrite local entity with remote change while conflict is unresolved
            continue;
          }
        }

        // No conflicting unpushed local edits; apply the remote change
        const existing = await table.get(change.entityId);

        if (change.op === 'delete') {
          if (existing) {
            if ('deletedAt' in existing) {
              await table.update(change.entityId, {
                deletedAt: (change.payload.deletedAt as number) ?? change.changedAt,
                version: change.version,
                updatedAt: change.changedAt,
              });
            } else {
              await table.delete(change.entityId);
            }
            applied++;
          }
        } else {
          // op is 'insert' or 'update'
          if (existing && typeof existing.version === 'number' && existing.version >= change.version) {
            // Already at or ahead of this version
            continue;
          }

          const recordToSave = {
            ...(existing ?? {}),
            ...change.payload,
            id: change.entityId,
            tenantId: this.tenantId,
            version: change.version,
            updatedAt: change.changedAt,
          };

          await table.put(recordToSave);
          applied++;
        }
      }

      // Advance cursor in the same atomic transaction
      const stateId = `${this.tenantId}:${datasetKey}`;
      const syncRecord: SyncStateRecord = {
        id: stateId,
        tenantId: this.tenantId,
        dataset: datasetKey,
        lastCursor: nextCursor,
        lastSyncAt: Date.now(),
        status: 'idle',
        lastError: null,
      };

      await this.db.syncState.put(syncRecord);
    });

    return { applied, conflicts };
  }

  /**
   * Pulls changes for a specific dataset (or global stream if dataset is omitted/all)
   * until caught up.
   */
  public async pullDataset(
    datasetKey: string,
    transport: PullTransportFn,
    branchId?: string
  ): Promise<{
    changesApplied: number;
    conflictsDetected: number;
    finalCursor: number;
  }> {
    let currentCursor = await this.getCursor(datasetKey);
    let totalApplied = 0;
    let totalConflicts = 0;
    let hasMore = true;

    const datasetParam = datasetKey === 'all' ? undefined : datasetKey;
    const branchParam = branchId || this.options.branchId || undefined;

    while (hasMore) {
      const response = await transport({
        cursor: currentCursor,
        dataset: datasetParam,
        branchId: branchParam,
        limit: this.options.batchSize,
      });

      if (response.changes.length > 0) {
        const { applied, conflicts } = await this.applyChangesBatch(
          response.changes,
          datasetKey,
          response.nextCursor
        );

        totalApplied += applied;
        totalConflicts += conflicts;

        syncEvents.emit('sync:progress', {
          phase: 'pull',
          dataset: datasetKey,
          processed: response.changes.length,
        });
      }

      currentCursor = response.nextCursor;
      hasMore = response.hasMore && response.changes.length > 0;
    }

    return {
      changesApplied: totalApplied,
      conflictsDetected: totalConflicts,
      finalCursor: currentCursor,
    };
  }

  /**
   * Pulls all changes either via a unified single stream ('all') or
   * per-dataset if configured.
   */
  public async pullAll(
    transport: PullTransportFn,
    options: { unified?: boolean; datasets?: string[]; branchId?: string } = {}
  ): Promise<{ totalApplied: number; totalConflicts: number }> {
    const unified = options.unified ?? true;

    if (unified) {
      const result = await this.pullDataset('all', transport, options.branchId);
      return {
        totalApplied: result.changesApplied,
        totalConflicts: result.conflictsDetected,
      };
    }

    const datasetsToPull = options.datasets ?? this.options.datasets;
    let totalApplied = 0;
    let totalConflicts = 0;

    for (const dataset of datasetsToPull) {
      const result = await this.pullDataset(dataset, transport, options.branchId);
      totalApplied += result.changesApplied;
      totalConflicts += result.conflictsDetected;
    }

    return { totalApplied, totalConflicts };
  }
}

