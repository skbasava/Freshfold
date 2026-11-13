import type { LaundryDatabase } from '../database/db';
import { connectivity } from './connectivity';
import { computeBackoffDelay, shouldRetry } from './retry';
import {
  OutboxPushEngine,
  type BatchTransportFn,
  type OutboxPushOptions,
} from './push';

export interface OutboxSchedulerState {
  isSyncing: boolean;
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

export type StateListener = (state: OutboxSchedulerState) => void;

export class OutboxScheduler {
  private pushEngine: OutboxPushEngine;
  private db: LaundryDatabase;
  private tenantId: string;
  private transport: BatchTransportFn;

  private isRunning = false;
  private isSyncing = false;
  private consecutiveFailures = 0;
  private nextRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeConnectivity: (() => void) | null = null;
  private stateListeners: Set<StateListener> = new Set();

  private lastSyncAt: number | null = null;
  private lastError: string | null = null;

  constructor(
    db: LaundryDatabase,
    tenantId: string,
    transport: BatchTransportFn,
    options?: OutboxPushOptions
  ) {
    this.db = db;
    this.tenantId = tenantId;
    this.transport = transport;
    this.pushEngine = new OutboxPushEngine(db, tenantId, options);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Listen to network status changes
    this.unsubscribeConnectivity = connectivity.subscribe((isOnline) => {
      this.notifyState();
      if (isOnline) {
        // Reset failure backoff and flush immediately
        this.consecutiveFailures = 0;
        void this.flush();
      }
    });

    // Recover any operations that were left in-flight
    void this.pushEngine.recoverStuckInFlight().then(() => {
      void this.flush();
    });
  }

  public stop(): void {
    this.isRunning = false;
    if (this.nextRetryTimer) {
      clearTimeout(this.nextRetryTimer);
      this.nextRetryTimer = null;
    }
    if (this.unsubscribeConnectivity) {
      this.unsubscribeConnectivity();
      this.unsubscribeConnectivity = null;
    }
  }

  public subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    void this.getState().then((state) => listener(state));
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public async getState(): Promise<OutboxSchedulerState> {
    const ops = await this.db.outbox
      .where('tenantId')
      .equals(this.tenantId)
      .toArray();

    const pendingCount = ops.filter((o) => o.status === 'pending' || o.status === 'in_flight').length;
    const failedCount = ops.filter((o) => o.status === 'failed').length;

    return {
      isSyncing: this.isSyncing,
      isOnline: connectivity.isConnected(),
      pendingCount,
      failedCount,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
    };
  }

  private notifyState(): void {
    void this.getState().then((state) => {
      for (const listener of this.stateListeners) {
        try {
          listener(state);
        } catch (err) {
          console.error('Error in outbox scheduler listener:', err);
        }
      }
    });
  }

  /**
   * Flushes outbox operations until empty or interrupted by network/conflict.
   */
  public async flush(): Promise<void> {
    if (this.isSyncing || !connectivity.isConnected()) {
      return;
    }

    this.isSyncing = true;
    this.notifyState();

    try {
      let hasMore = true;

      while (hasMore && connectivity.isConnected()) {
        const result = await this.pushEngine.pushBatch(this.transport);

        if (!result.processed) {
          hasMore = false;
          break;
        }

        // Check if any errors occurred
        if (result.errorCount > 0) {
          this.consecutiveFailures++;
          hasMore = false;
          this.scheduleRetry();
          break;
        }

        // If no progress made (e.g. server didn't ack, conflict, or error anything),
        // pause to avoid hot-looping
        if (result.acknowledgedCount === 0 && result.conflictCount === 0) {
          hasMore = false;
          break;
        }

        // Successfully pushed a batch
        this.consecutiveFailures = 0;
        this.lastSyncAt = Date.now();
        this.lastError = null;
      }
    } catch (err) {
      this.consecutiveFailures++;
      this.lastError = err instanceof Error ? err.message : String(err);
      this.scheduleRetry();
    } finally {
      this.isSyncing = false;
      this.notifyState();
    }
  }

  private scheduleRetry(): void {
    if (!this.isRunning || !shouldRetry(this.consecutiveFailures)) {
      return;
    }

    if (this.nextRetryTimer) {
      clearTimeout(this.nextRetryTimer);
    }

    const delay = computeBackoffDelay(this.consecutiveFailures);
    this.nextRetryTimer = setTimeout(() => {
      this.nextRetryTimer = null;
      void this.flush();
    }, delay);
  }
}
