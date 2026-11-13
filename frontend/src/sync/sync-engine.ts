import type { LaundryDatabase } from '../database/db';
import { OutboxPushEngine, type BatchTransportFn } from './push';
import { PullEngine, type PullTransportFn } from './pull';
import { ConflictResolver, type ResolveTransportFn } from './conflict-resolver';
import { OutboxScheduler } from './scheduler';
import { connectivity, ConnectivityManager, type ConnectivityListener } from './connectivity';
import { syncEvents, type SyncEventType } from './sync-events';
import {
  createSyncLockCoordinator,
  type SyncLockCoordinator,
  type WebLockManagerLike,
} from './locks';

export interface SyncEngineConfig {
  db: LaundryDatabase;
  tenantId: string;
  deviceId: string;
  branchId?: string;
  pushTransport: BatchTransportFn;
  pullTransport: PullTransportFn;
  resolveTransport?: ResolveTransportFn;
  lockManager?: WebLockManagerLike;
  connectivity?: ConnectivityManager;
  periodicIntervalMs?: number;
  batchSize?: number;
  datasets?: string[];
  autoStart?: boolean;
}

export interface SyncResult {
  success: boolean;
  pushedOps: number;
  pulledChanges: number;
  conflicts: number;
  error?: string;
}

export class SyncEngine {
  private db: LaundryDatabase;
  private tenantId: string;
  private deviceId: string;
  private branchId?: string;
  private config: SyncEngineConfig;

  private pushEngine: OutboxPushEngine;
  private pullEngine: PullEngine;
  private conflictResolver: ConflictResolver;
  private scheduler: OutboxScheduler;
  private lockCoordinator: SyncLockCoordinator;
  private connectivityManager: ConnectivityManager;

  private isRunning = false;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private unsubscribeConnectivity: (() => void) | null = null;

  constructor(config: SyncEngineConfig) {
    this.config = config;
    this.db = config.db;
    this.tenantId = config.tenantId;
    this.deviceId = config.deviceId;
    this.branchId = config.branchId;
    this.connectivityManager = config.connectivity ?? connectivity;

    this.pushEngine = new OutboxPushEngine(this.db, this.tenantId, {
      batchSize: config.batchSize ?? 25,
    });

    this.pullEngine = new PullEngine(this.db, this.tenantId, {
      batchSize: config.batchSize ?? 100,
      branchId: this.branchId,
      datasets: config.datasets,
    });

    this.conflictResolver = new ConflictResolver(this.db, this.tenantId);

    this.scheduler = new OutboxScheduler(
      this.db,
      this.tenantId,
      config.pushTransport,
      { batchSize: config.batchSize ?? 25 }
    );

    this.lockCoordinator = createSyncLockCoordinator({
      tenantId: this.tenantId,
      manager: config.lockManager,
    });

    if (config.autoStart) {
      this.start();
    }
  }

  public getPushEngine(): OutboxPushEngine {
    return this.pushEngine;
  }

  public getPullEngine(): PullEngine {
    return this.pullEngine;
  }

  public getConflictResolver(): ConflictResolver {
    return this.conflictResolver;
  }

  public getScheduler(): OutboxScheduler {
    return this.scheduler;
  }

  public getConnectivity(): ConnectivityManager {
    return this.connectivityManager;
  }

  /**
   * Starts background synchronization triggers:
   * - In-flight operation recovery
   * - Connectivity changes (auto-sync on reconnect)
   * - Page visibility changes (auto-sync when foregrounded)
   * - Periodic sync timer
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    // 1. Recover any stuck in-flight operations
    await this.pushEngine.recoverStuckInFlight();

    // 2. Connectivity listener
    this.unsubscribeConnectivity = this.connectivityManager.onStatusChange(
      (online) => {
        if (online) {
          syncEvents.emit('sync:online');
          this.sync().catch((err) =>
            console.error('Auto-sync on reconnect failed:', err)
          );
        } else {
          syncEvents.emit('sync:offline');
        }
      }
    );

    // 3. Tab visibility listener
    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible' && this.connectivityManager.isOnline()) {
          this.sync().catch((err) =>
            console.error('Auto-sync on visibility change failed:', err)
          );
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    // 4. Periodic sync timer
    const intervalMs = this.config.periodicIntervalMs ?? 30_000;
    if (intervalMs > 0) {
      this.periodicTimer = setInterval(() => {
        if (this.connectivityManager.isOnline()) {
          this.sync().catch((err) =>
            console.error('Periodic sync failed:', err)
          );
        }
      }, intervalMs);
    }
  }

  /**
   * Stops background synchronization timers and listeners.
   */
  public stop(): void {
    this.isRunning = false;

    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }

    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    if (this.unsubscribeConnectivity) {
      this.unsubscribeConnectivity();
      this.unsubscribeConnectivity = null;
    }
  }

  /**
   * Executes a complete synchronization cycle:
   * Coordinates multi-tab Web Lock, pushes pending outbox mutations,
   * then pulls remote changes and advances cursors.
   */
  public async sync(options?: {
    force?: boolean;
    datasets?: string[];
  }): Promise<SyncResult> {
    if (!options?.force && !this.connectivityManager.isOnline()) {
      return {
        success: false,
        pushedOps: 0,
        pulledChanges: 0,
        conflicts: 0,
        error: 'Offline',
      };
    }

    const lockResult = await this.lockCoordinator.withSyncLock(
      async () => {
        syncEvents.emit('sync:start');

        let totalPushed = 0;
        let totalConflicts = 0;

        try {
          // --- Phase 1: PUSH ---
          let pushing = true;
          while (pushing) {
            const pushResult = await this.pushEngine.pushBatch(
              this.config.pushTransport
            );
            totalPushed += pushResult.acknowledgedCount;
            totalConflicts += pushResult.conflictCount;

            pushing = pushResult.processed && pushResult.acknowledgedCount > 0;
          }

          // --- Phase 2: PULL ---
          const pullResult = await this.pullEngine.pullAll(
            this.config.pullTransport,
            { datasets: options?.datasets, branchId: this.branchId }
          );

          totalConflicts += pullResult.totalConflicts;

          const result: SyncResult = {
            success: true,
            pushedOps: totalPushed,
            pulledChanges: pullResult.totalApplied,
            conflicts: totalConflicts,
          };

          syncEvents.emit('sync:complete', result);
          return result;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          syncEvents.emit('sync:error', { error: errMsg });

          return {
            success: false,
            pushedOps: totalPushed,
            pulledChanges: 0,
            conflicts: totalConflicts,
            error: errMsg,
          };
        }
      },
      { ifAvailable: true }
    );

    if (!lockResult.ran) {
      // Another tab or process is currently holding the sync lock
      return {
        success: false,
        pushedOps: 0,
        pulledChanges: 0,
        conflicts: 0,
        error: 'Sync lock held by another tab',
      };
    }

    return lockResult.result!;
  }

  /**
   * Resolves a conflict via the ConflictResolver.
   */
  public async resolveConflict(
    conflictId: string,
    resolution: 'keep_local' | 'accept_server' | 'custom',
    customPayload?: Record<string, unknown>
  ): Promise<boolean> {
    return await this.conflictResolver.resolveConflict({
      conflictId,
      resolution,
      customPayload,
      transport: this.config.resolveTransport,
    });
  }

  /**
   * Cleanup on logout or device revocation:
   * Halts synchronization and purges tenant local data from IndexedDB.
   */
  public async cleanupOnLogout(options: { wipeAll?: boolean } = {}): Promise<void> {
    this.stop();

    const tables = [
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

    await this.db.transaction('rw', tables, async () => {
      if (options.wipeAll) {
        for (const table of tables) {
          await table.clear();
        }
      } else {
        // Scoped tenant purge
        for (const table of tables) {
          try {
            await table.where('tenantId').equals(this.tenantId).delete();
          } catch {
            // Some tables might not have tenantId index; fallback to filter or clear
            await table.toCollection().delete();
          }
        }
      }
    });
  }
}
