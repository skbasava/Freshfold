import type { OrderSummary } from "@laundry/contracts";
import type { StorageBackend } from "../db/types";
import {
  applyOrderSnapshot,
  type SnapshotResult,
} from "./change-feed";

export interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

function defaultStorageManager(): StorageManagerLike | null {
  return (
    globalThis as {
      navigator?: { storage?: StorageManagerLike };
    }
  ).navigator?.storage ?? null;
}

export async function requestStoragePersistence(
  manager: StorageManagerLike | null = defaultStorageManager(),
): Promise<boolean> {
  if (!manager?.persist) {
    return false;
  }
  try {
    return await manager.persist();
  } catch {
    return false;
  }
}

export interface RebuildFromSnapshotOptions {
  backend: StorageBackend;
  hubId: string;
  cursor: number;
  snapshot: OrderSummary[];
  lostMutationCount?: number;
  now?: number;
}

export interface RebuildFromSnapshotResult extends SnapshotResult {
  lostMutations: number;
  warning: string | null;
}

export async function rebuildFromSnapshot(
  options: RebuildFromSnapshotOptions,
): Promise<RebuildFromSnapshotResult> {
  const result = await applyOrderSnapshot({
    backend: options.backend,
    hubId: options.hubId,
    cursor: options.cursor,
    orders: options.snapshot,
    now: options.now,
  });
  const lostMutations = options.lostMutationCount ?? 0;
  return {
    ...result,
    lostMutations,
    warning:
      lostMutations > 0
        ? `Local storage was cleared. ${lostMutations} unsynced change${
            lostMutations === 1 ? "" : "s"
          } may be lost.`
        : null,
  };
}

export interface PendingMutationWarningOptions {
  backend: StorageBackend;
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  now?: number;
}

export interface PendingMutationWarning {
  refresh(): Promise<string | null>;
  dispose(): void;
}

export function createPendingMutationWarning(
  options: PendingMutationWarningOptions,
): PendingMutationWarning {
  let message: string | null = null;

  const listener = (event: Event): void => {
    if (!message) {
      return;
    }
    event.preventDefault();
    (event as unknown as { returnValue?: string }).returnValue = message;
  };

  options.target.addEventListener("beforeunload", listener);

  return {
    async refresh() {
      const pending = (await options.backend.listMutations()).filter(
        (mutation) => mutation.status === "pending",
      );
      if (pending.length === 0) {
        message = null;
        return null;
      }
      const oldest = Math.min(
        ...pending.map((mutation) => mutation.createdAt),
      );
      const now = options.now ?? Date.now();
      const ageMinutes = Math.max(0, Math.floor((now - oldest) / 60_000));
      message = `You have ${pending.length} unsynced change${
        pending.length === 1 ? "" : "s"
      }. The oldest is ${ageMinutes} minute${
        ageMinutes === 1 ? "" : "s"
      } old. They may be lost if you close this tab.`;
      return message;
    },
    dispose() {
      options.target.removeEventListener("beforeunload", listener);
    },
  };
}
