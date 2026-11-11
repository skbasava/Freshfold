import type {
  LocalOrder,
  LocalOrderSyncState,
  PendingMutation,
} from "../sync/types";
import { isServerConfirmed } from "../sync/types";

export type SyncTone = "success" | "info" | "warning" | "danger";

export interface OrderSyncPresentation {
  state: LocalOrderSyncState;
  label: string;
  tone: SyncTone;
  provisional: boolean;
  serverConfirmed: boolean;
  requiresReview: boolean;
  message: string | null;
  serverVersion: number | null;
}

function latestMutation(
  mutations: PendingMutation[],
  orderId: string,
): PendingMutation | undefined {
  return mutations
    .filter((mutation) => mutation.orderId === orderId)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
}

export function describeOrderSync(
  order: LocalOrder,
  mutations: PendingMutation[] = [],
): OrderSyncPresentation {
  const mutation = latestMutation(mutations, order.id);
  const serverVersion = mutation?.serverOrder?.version ?? null;
  const confirmed = isServerConfirmed(order);

  switch (order.syncState) {
    case "synced":
      return {
        state: "synced",
        label: "Confirmed",
        tone: "success",
        provisional: false,
        serverConfirmed: confirmed,
        requiresReview: false,
        message: null,
        serverVersion,
      };
    case "rejected":
      return {
        state: "rejected",
        label: "Rejected",
        tone: "danger",
        provisional: true,
        serverConfirmed: confirmed,
        requiresReview: true,
        message: order.lastError ?? mutation?.lastError ?? "Rejected by the server",
        serverVersion,
      };
    case "conflict":
      return {
        state: "conflict",
        label: "Needs review",
        tone: "warning",
        provisional: true,
        serverConfirmed: confirmed,
        requiresReview: true,
        message:
          order.lastError ??
          mutation?.lastError ??
          "This order changed on the server while you were offline.",
        serverVersion,
      };
    case "pending":
      return {
        state: "pending",
        label: "Pending sync",
        tone: "info",
        provisional: true,
        serverConfirmed: confirmed,
        requiresReview: false,
        message: "Saved on this device. Waiting for the server to confirm.",
        serverVersion,
      };
  }
}

export interface SyncSummary {
  total: number;
  synced: number;
  pending: number;
  conflict: number;
  rejected: number;
  unsynced: number;
}

export function summarizeSyncState(orders: LocalOrder[]): SyncSummary {
  const summary: SyncSummary = {
    total: orders.length,
    synced: 0,
    pending: 0,
    conflict: 0,
    rejected: 0,
    unsynced: 0,
  };

  for (const order of orders) {
    summary[order.syncState] += 1;
    if (order.syncState !== "synced") {
      summary.unsynced += 1;
    }
  }

  return summary;
}
