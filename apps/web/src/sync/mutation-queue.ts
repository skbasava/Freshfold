import type { ApplyChangeIntent, OrderSummary } from "@laundry/contracts";
import type { StorageBackend } from "../db/types";
import { localOrderFromServer } from "../orders/local-order";
import type { LocalOrder, PendingMutation } from "./types";

export interface CreatePendingMutationInput {
  orderId: string;
  intent: ApplyChangeIntent;
  payload: unknown;
  baseVersion: number | null;
  now?: number;
}

export interface MarkSyncedOptions {
  orderVersion?: number;
  serverOrder?: OrderSummary;
}

export function createMutationId(): string {
  return crypto.randomUUID();
}

export function createPendingMutation(
  input: CreatePendingMutationInput,
): PendingMutation {
  return {
    mutationId: createMutationId(),
    orderId: input.orderId,
    intent: input.intent,
    payload: input.payload,
    baseVersion: input.baseVersion,
    createdAt: input.now ?? Date.now(),
    attempts: 0,
    status: "pending",
    lastError: null,
  };
}

function requireMutation(
  mutation: PendingMutation | undefined,
  mutationId: string,
): PendingMutation {
  if (!mutation) {
    throw new Error(`Unknown mutation: ${mutationId}`);
  }
  return mutation;
}

export function createMutationQueue(backend: StorageBackend) {
  function applyTerminalState(
    mutationId: string,
    status: "rejected" | "conflict",
    error?: string,
    serverOrder?: LocalOrder | null,
  ): Promise<PendingMutation> {
    return backend.runTransaction(
      ["mutations", "orders"],
      "readwrite",
      async (tx) => {
        const existing = requireMutation(
          await tx.getMutation(mutationId),
          mutationId,
        );
        const updated: PendingMutation = {
          ...existing,
          status,
          lastError: error ?? null,
          ...(serverOrder === undefined ? {} : { serverOrder }),
        };
        await tx.putMutation(updated);

        const order = await tx.getOrder(existing.orderId);
        if (order) {
          await tx.putOrder({
            ...order,
            syncState: status,
            lastError: error ?? null,
          });
        }

        return updated;
      },
    );
  }

  return {
    async enqueueOptimistic(
      order: LocalOrder,
      mutation: PendingMutation,
    ): Promise<{ order: LocalOrder; mutation: PendingMutation }> {
      if (mutation.orderId !== order.id) {
        throw new Error(
          `Mutation ${mutation.mutationId} targets order ${mutation.orderId}, not ${order.id}`,
        );
      }

      return backend.runTransaction(
        ["orders", "mutations"],
        "readwrite",
        async (tx) => {
          const persistedOrder: LocalOrder = {
            ...order,
            syncState: "pending",
          };
          await tx.putOrder(persistedOrder);
          await tx.putMutation(mutation);
          return { order: persistedOrder, mutation };
        },
      );
    },

    listMutations(orderId?: string): Promise<PendingMutation[]> {
      return backend.listMutations(orderId);
    },

    getMutation(mutationId: string): Promise<PendingMutation | undefined> {
      return backend.getMutation(mutationId);
    },

    getOrder(orderId: string): Promise<LocalOrder | undefined> {
      return backend.getOrder(orderId);
    },

    markRejected(mutationId: string, error?: string): Promise<PendingMutation> {
      return applyTerminalState(mutationId, "rejected", error);
    },

    markConflict(
      mutationId: string,
      error?: string,
      serverOrder?: LocalOrder | null,
    ): Promise<PendingMutation> {
      return applyTerminalState(
        mutationId,
        "conflict",
        error,
        serverOrder,
      );
    },

    markSynced(
      mutationId: string,
      options: MarkSyncedOptions = {},
    ): Promise<PendingMutation> {
      return backend.runTransaction(
        ["mutations", "orders"],
        "readwrite",
        async (tx) => {
          const existing = requireMutation(
            await tx.getMutation(mutationId),
            mutationId,
          );
          if (existing.status !== "pending") {
            return existing;
          }

          const updated: PendingMutation = {
            ...existing,
            status: "synced",
            lastError: null,
          };
          await tx.putMutation(updated);

          const remainingPending = (
            await tx.listMutations(existing.orderId)
          ).filter(
            (mutation) =>
              mutation.mutationId !== mutationId &&
              mutation.status === "pending",
          );
          const order = await tx.getOrder(existing.orderId);
          if (order) {
            if (options.serverOrder) {
              const canonical = localOrderFromServer(
                options.serverOrder,
                remainingPending.length > 0 ? "pending" : "synced",
              );
              await tx.putOrder(
                remainingPending.length > 0
                  ? {
                      ...order,
                      version: Math.max(order.version, canonical.version),
                      syncState: "pending",
                      lastError: null,
                    }
                  : canonical,
              );
            } else {
              await tx.putOrder({
                ...order,
                syncState:
                  remainingPending.length > 0 ? "pending" : "synced",
                version: options.orderVersion ?? order.version,
                lastError: null,
              });
            }
          }

          return updated;
        },
      );
    },

    recordAttempt(mutationId: string): Promise<PendingMutation> {
      return backend.runTransaction(
        ["mutations"],
        "readwrite",
        async (tx) => {
          const existing = requireMutation(
            await tx.getMutation(mutationId),
            mutationId,
          );
          const updated: PendingMutation = {
            ...existing,
            attempts: existing.attempts + 1,
          };
          await tx.putMutation(updated);
          return updated;
        },
      );
    },
  };
}

export type MutationQueue = ReturnType<typeof createMutationQueue>;
