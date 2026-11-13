import React from 'react';
import { Badge, type BadgeTone } from '../data-display/Badge';
import { Button } from '../primitives/Button';
import type { UseSyncReturn } from '../../../hooks/useSync';

export interface SyncStatusBadgeProps {
  sync: UseSyncReturn;
  showSyncButton?: boolean;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  sync,
  showSyncButton = true,
}) => {
  const {
    isSyncing,
    isOnline,
    pendingCount,
    failedCount,
    conflictsCount,
    lastSyncAt,
    lastError,
    triggerSync,
  } = sync;

  let tone: BadgeTone = 'success';
  let label = 'Synced';

  if (!isOnline) {
    tone = 'warning';
    label = pendingCount > 0 ? `Offline (${pendingCount} pending)` : 'Offline';
  } else if (conflictsCount > 0) {
    tone = 'danger';
    label = `${conflictsCount} Conflict${conflictsCount > 1 ? 's' : ''}`;
  } else if (isSyncing) {
    tone = 'primary';
    label = 'Syncing...';
  } else if (failedCount > 0 || lastError) {
    tone = 'danger';
    label = failedCount > 0 ? `${failedCount} Failed Ops` : 'Sync Error';
  } else if (pendingCount > 0) {
    tone = 'primary';
    label = `${pendingCount} Pending`;
  }

  const formatLastSync = (ts: number | null): string => {
    if (!ts) return 'Never';
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="inline-flex items-center gap-2" data-testid="sync-status-badge">
      <Badge tone={tone}>
        <span
          className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
            isSyncing
              ? 'bg-blue-600 animate-pulse'
              : tone === 'success'
              ? 'bg-green-600'
              : tone === 'warning'
              ? 'bg-amber-600'
              : 'bg-red-600'
          }`}
          aria-hidden="true"
        />
        {label}
      </Badge>

      {lastSyncAt && isOnline && !isSyncing && (
        <span className="text-xs text-text-muted hidden sm:inline" title={new Date(lastSyncAt).toISOString()}>
          Synced {formatLastSync(lastSyncAt)}
        </span>
      )}

      {showSyncButton && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => triggerSync()}
          disabled={isSyncing || !isOnline}
          aria-label="Trigger manual synchronization"
        >
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      )}
    </div>
  );
};
