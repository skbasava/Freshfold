import type { Table } from 'dexie';
import type { LaundryDatabase } from '../database/db';
import type {
  SyncEntity,
  SyncResolveRequest,
  SyncResolveResponse,
} from '../../../packages/contracts/src/sync';
import type {
  OutboxOperation,
  SyncConflictRecord,
} from '../domain/types';

export type ResolveTransportFn = (
  request: SyncResolveRequest
) => Promise<SyncResolveResponse>;

export interface ResolveConflictParams {
  conflictId: string;
  resolution: 'keep_local' | 'accept_server' | 'custom';
  customPayload?: Record<string, unknown>;
  transport?: ResolveTransportFn;
}

export class ConflictResolver {
  private db: LaundryDatabase;
  private tenantId: string;

  constructor(db: LaundryDatabase, tenantId: string) {
    this.db = db;
    this.tenantId = tenantId;
  }

  private getTableForEntity(entity: string): Table<any, string> | null {
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

  public async getPendingConflicts(): Promise<SyncConflictRecord[]> {
    return await this.db.conflicts
      .where('tenantId')
      .equals(this.tenantId)
      .filter((c) => !c.resolved)
      .toArray();
  }

  public async getConflictById(
    conflictId: string
  ): Promise<SyncConflictRecord | undefined> {
    return await this.db.conflicts.get(conflictId);
  }

  /**
   * Resolves a recorded conflict according to the selected strategy.
   */
  public async resolveConflict({
    conflictId,
    resolution,
    customPayload,
    transport,
  }: ResolveConflictParams): Promise<boolean> {
    const conflict = await this.getConflictById(conflictId);
    if (!conflict || conflict.resolved) {
      return false;
    }

    const table = this.getTableForEntity(conflict.entity);
    if (!table) {
      throw new Error(`Unknown entity type for conflict: ${conflict.entity}`);
    }

    let remoteNewVersion = conflict.serverVersion;

    // If transport is supplied, sync with server /api/sync/resolve
    if (transport) {
      const serverResult = await transport({
        conflictId,
        entity: conflict.entity as SyncEntity,
        entityId: conflict.entityId,
        resolution,
        customPayload,
      });
      if (serverResult.newVersion) {
        remoteNewVersion = serverResult.newVersion;
      }
    }

    const now = Date.now();

    await this.db.transaction(
      'rw',
      [table, this.db.outbox, this.db.conflicts],
      async () => {
        if (resolution === 'accept_server') {
          // 1. Accept server: overwrite local entity with server state
          const existing = await table.get(conflict.entityId);
          await table.put({
            ...(existing ?? {}),
            ...conflict.serverPayload,
            id: conflict.entityId,
            tenantId: this.tenantId,
            version: remoteNewVersion,
            updatedAt: now,
          });

          // Remove any pending/failed outbox operations for this entity
          const pendingOps = await this.db.outbox
            .where('tenantId')
            .equals(this.tenantId)
            .filter(
              (op) =>
                op.entity === conflict.entity &&
                op.entityId === conflict.entityId
            )
            .toArray();

          for (const op of pendingOps) {
            await this.db.outbox.delete(op.operationId);
          }
        } else if (resolution === 'keep_local') {
          // 2. Keep local: re-queue local payload with baseVersion updated to serverVersion
          const pendingOps = await this.db.outbox
            .where('tenantId')
            .equals(this.tenantId)
            .filter(
              (op) =>
                op.entity === conflict.entity &&
                op.entityId === conflict.entityId
            )
            .toArray();

          if (pendingOps.length > 0) {
            // Update baseVersion and set back to pending
            for (const op of pendingOps) {
              await this.db.outbox.update(op.operationId, {
                baseVersion: conflict.serverVersion,
                status: 'pending',
                lastError: null,
              });
            }
          } else {
            // Create a fresh outbox operation to push local state
            const newOp: OutboxOperation = {
              operationId: crypto.randomUUID(),
              tenantId: this.tenantId,
              deviceId: 'conflict-resolver',
              entity: conflict.entity,
              entityId: conflict.entityId,
              action: 'update',
              payload: conflict.localPayload,
              baseVersion: conflict.serverVersion,
              createdAt: now,
              retryCount: 0,
              status: 'pending',
              lastError: null,
            };
            await this.db.outbox.put(newOp);
          }
        } else if (resolution === 'custom') {
          // 3. Custom merge: apply custom payload locally and queue outbox op
          if (!customPayload) {
            throw new Error('customPayload is required for resolution "custom"');
          }

          const existing = await table.get(conflict.entityId);
          await table.put({
            ...(existing ?? {}),
            ...customPayload,
            id: conflict.entityId,
            tenantId: this.tenantId,
            version: remoteNewVersion,
            updatedAt: now,
          });

          // Enqueue outbox update with custom payload
          const newOp: OutboxOperation = {
            operationId: crypto.randomUUID(),
            tenantId: this.tenantId,
            deviceId: 'conflict-resolver',
            entity: conflict.entity,
            entityId: conflict.entityId,
            action: 'update',
            payload: customPayload,
            baseVersion: conflict.serverVersion,
            createdAt: now,
            retryCount: 0,
            status: 'pending',
            lastError: null,
          };
          await this.db.outbox.put(newOp);
        }

        // Mark conflict resolved
        await this.db.conflicts.update(conflictId, {
          resolved: true,
          resolvedAt: now,
          resolution,
        });
      }
    );

    return true;
  }
}

