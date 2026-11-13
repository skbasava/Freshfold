import type { LocalOrderSyncState } from "../../sync/types";

export interface SyncNotice {
  tone: "info" | "warning" | "danger";
  title: string;
  message: string;
}

export function describeSyncState(order: {
  syncState: LocalOrderSyncState;
  lastError?: string | null;
}): SyncNotice | null {
  switch (order.syncState) {
    case "pending":
      return {
        tone: "info",
        title: "Waiting to send.",
        message:
          "Saved on this device. Waiting for the server to confirm.",
      };
    case "conflict":
      return {
        tone: "warning",
        title: "This order needs review.",
        message:
          order.lastError ??
          "This order changed on another device. Check the latest details before making more changes.",
      };
    case "rejected":
      return {
        tone: "danger",
        title: "Change rejected.",
        message:
          order.lastError ??
          "The server could not accept the last change. Please check the order and try again.",
      };
    case "synced":
      return null;
  }
}
