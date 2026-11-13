export type SyncEvent =
  | {
      type: "mutation-synced";
      hubId: string;
      orderId: string;
      mutationId: string;
      orderVersion: number;
    }
  | {
      type: "mutation-conflict";
      hubId: string;
      orderId: string;
      mutationId: string;
      reason: string;
    }
  | {
      type: "mutation-rejected";
      hubId: string;
      orderId: string;
      mutationId: string;
      reason: string;
    }
  | {
      type: "cursor-advanced";
      hubId: string;
      cursor: number;
    }
  | {
      type: "pending-changed";
      hubId: string;
      pendingCount: number;
    }
  | {
      type: "storage-reset";
      hubId: string;
      lostMutations: number;
    };

export interface BroadcastChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  close?(): void;
}

export interface CreateSyncBroadcastOptions {
  hubId: string;
  channelName?: string;
  channelFactory?: (name: string) => BroadcastChannelLike | null;
}

export interface SyncBroadcast {
  post(event: SyncEvent): void;
  subscribe(listener: (event: SyncEvent) => void): () => void;
  close(): void;
}

const EVENT_TYPES = new Set([
  "mutation-synced",
  "mutation-conflict",
  "mutation-rejected",
  "cursor-advanced",
  "pending-changed",
  "storage-reset",
]);

function isSyncEvent(value: unknown): value is SyncEvent {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const event = value as Record<string, unknown>;
  if (
    typeof event.type !== "string" ||
    !EVENT_TYPES.has(event.type) ||
    typeof event.hubId !== "string"
  ) {
    return false;
  }
  switch (event.type) {
    case "mutation-synced":
      return (
        typeof event.orderId === "string" &&
        typeof event.mutationId === "string" &&
        typeof event.orderVersion === "number"
      );
    case "mutation-conflict":
    case "mutation-rejected":
      return (
        typeof event.orderId === "string" &&
        typeof event.mutationId === "string" &&
        typeof event.reason === "string"
      );
    case "cursor-advanced":
      return typeof event.cursor === "number";
    case "pending-changed":
      return typeof event.pendingCount === "number";
    case "storage-reset":
      return typeof event.lostMutations === "number";
    default:
      return false;
  }
}

function defaultChannelFactory(name: string): BroadcastChannelLike | null {
  const BroadcastChannelCtor = (
    globalThis as {
      BroadcastChannel?: new (name: string) => BroadcastChannelLike;
    }
  ).BroadcastChannel;
  if (!BroadcastChannelCtor) {
    return null;
  }
  return new BroadcastChannelCtor(name);
}

export function createSyncBroadcast(
  options: CreateSyncBroadcastOptions,
): SyncBroadcast {
  const listeners = new Set<(event: SyncEvent) => void>();
  const factory = options.channelFactory ?? defaultChannelFactory;
  const channel = factory(options.channelName ?? "laundry-sync");

  if (channel) {
    channel.onmessage = (message) => {
      if (isSyncEvent(message.data) && message.data.hubId === options.hubId) {
        for (const listener of listeners) {
          listener(message.data);
        }
      }
    };
  }

  return {
    post(event) {
      if (event.hubId !== options.hubId) {
        throw new Error(
          `Cannot broadcast hub ${event.hubId} events from hub ${options.hubId}`,
        );
      }
      channel?.postMessage(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      listeners.clear();
      if (channel) {
        channel.onmessage = null;
        channel.close?.();
      }
    },
  };
}
