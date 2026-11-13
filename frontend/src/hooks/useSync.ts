import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDatabase, type LaundryDatabase } from '../database/db';
import { connectivity } from '../sync/connectivity';
import { syncEvents } from '../sync/sync-events';
import type { SyncEngine, SyncResult } from '../sync/sync-engine';

export interface UseSyncOptions {
  tenantId: string;
  db?: LaundryDatabase;
  syncEngine?: SyncEngine;
}

export interface UseSyncReturn {
  isSyncing: boolean;
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  conflictsCount: number;
  lastSyncAt: number | null;
  lastError: string | null;
  triggerSync: () => Promise<SyncResult | null>;
}

export function useSync({
  tenantId,
  db: customDb,
  syncEngine,
}: UseSyncOptions): UseSyncReturn {
  const db = customDb ?? getDatabase();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => connectivity.isOnline());
  const [lastError, setLastError] = useState<string | null>(null);

  // Connectivity listener
  useEffect(() => {
    return connectivity.onStatusChange((online) => {
      setIsOnline(online);
    });
  }, []);

  // Sync event listener for reactive UI state transitions
  useEffect(() => {
    const unsubStart = syncEvents.on('sync:start', () => {
      setIsSyncing(true);
      setLastError(null);
    });

    const unsubComplete = syncEvents.on('sync:complete', () => {
      setIsSyncing(false);
    });

    const unsubError = syncEvents.on('sync:error', (payload: any) => {
      setIsSyncing(false);
      setLastError(payload?.error ?? 'Sync failed');
    });

    return () => {
      unsubStart();
      unsubComplete();
      unsubError();
    };
  }, []);

  // Reactive live query for outbox operation counts
  const outboxCounts = useLiveQuery(
    async () => {
      const ops = await db.outbox
        .where('tenantId')
        .equals(tenantId)
        .toArray();

      let pending = 0;
      let failed = 0;

      for (const op of ops) {
        if (op.status === 'pending' || op.status === 'in_flight') {
          pending++;
        } else if (op.status === 'failed') {
          failed++;
        }
      }

      return { pending, failed };
    },
    [tenantId],
    { pending: 0, failed: 0 }
  );

  // Reactive live query for unresolved conflicts
  const conflictsCount = useLiveQuery(
    async () => {
      return await db.conflicts
        .where('tenantId')
        .equals(tenantId)
        .filter((c) => !c.resolved)
        .count();
    },
    [tenantId],
    0
  );

  // Reactive live query for latest sync timestamp
  const lastSyncAt = useLiveQuery(
    async () => {
      const records = await db.syncState
        .where('tenantId')
        .equals(tenantId)
        .toArray();

      if (records.length === 0) return null;
      return Math.max(...records.map((r) => r.lastSyncAt));
    },
    [tenantId],
    null
  );

  const triggerSync = useCallback(async (): Promise<SyncResult | null> => {
    if (!syncEngine) {
      return null;
    }
    setIsSyncing(true);
    try {
      const result = await syncEngine.sync();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [syncEngine]);

  return {
    isSyncing,
    isOnline,
    pendingCount: outboxCounts?.pending ?? 0,
    failedCount: outboxCounts?.failed ?? 0,
    conflictsCount: conflictsCount ?? 0,
    lastSyncAt: lastSyncAt ?? null,
    lastError,
    triggerSync,
  };
}

