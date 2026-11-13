import {
  changeFeedResponseSchema,
  type ChangeFeedResponse,
  type ChangeRecord,
} from "@laundry/contracts";
import type { OrderSummary } from "@laundry/contracts";
import type { StorageBackend } from "../db/types";
import { localOrderFromServer } from "../orders/local-order";
import { defaultFetch, type FetchLike } from "./fetch";
import type { LocalOrder, PendingMutation } from "./types";

export interface ChangeFeedClient {
  fetchPage(since: number, limit: number): Promise<ChangeFeedResponse>;
}

export interface HttpChangeFeedClientOptions {
  fetchImpl?: FetchLike;
  endpoint?: string;
  headers?: Record<string, string>;
  credentials?: "same-origin" | "include" | "omit";
}

export function createHttpChangeFeedClient(
  options: HttpChangeFeedClientOptions = {},
): ChangeFeedClient {
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const endpoint = options.endpoint ?? "/api/changes";

  return {
    async fetchPage(since, limit) {
      const separator = endpoint.includes("?") ? "&" : "?";
      const url = `${endpoint}${separator}since=${encodeURIComponent(
        String(since),
      )}&limit=${encodeURIComponent(String(limit))}`;
      const response = await fetchImpl(url, {
        credentials: options.credentials ?? "same-origin",
        headers: options.headers,
      });
      if (!response.ok) {
        throw new Error(`Change feed request failed: HTTP ${response.status}`);
      }
      return changeFeedResponseSchema.parse(await response.json());
    },
  };
}

export interface ChangeFeedPullOptions {
  backend: StorageBackend;
  client: ChangeFeedClient;
  hubId: string;
  limit?: number;
  maxPages?: number;
  now?: number;
}

export interface ChangeFeedPullResult {
  pages: number;
  applied: number;
  conflicts: number;
  cursor: number;
}

export interface ApplyChangePageOptions {
  backend: StorageBackend;
  hubId: string;
  since: number;
  page: ChangeFeedResponse;
  now?: number;
}

export interface ChangePageResult {
  applied: number;
  conflicts: number;
  cursor: number;
}

function assertPageIsOrdered(
  page: ChangeFeedResponse,
  since: number,
): void {
  let previous = since;
  for (const change of page.changes) {
    if (change.sequence <= previous) {
      throw new Error(
        `Change feed sequences must increase strictly (got ${change.sequence} after ${previous})`,
      );
    }
    previous = change.sequence;
  }
  if (page.nextCursor < since || page.nextCursor < previous) {
    throw new Error(
      `Change feed cursor moved backwards from ${since} to ${page.nextCursor}`,
    );
  }
}

function assertHub(change: ChangeRecord, hubId: string): void {
  if (change.hubId !== hubId) {
    throw new Error(
      `Change feed hub mismatch: expected ${hubId}, received ${change.hubId}`,
    );
  }
}

function conflictMutations(
  mutations: PendingMutation[],
  error: string,
  serverOrder: LocalOrder | null,
): PendingMutation[] {
  return mutations
    .filter((mutation) => mutation.status === "pending")
    .map((mutation) => ({
      ...mutation,
      status: "conflict" as const,
      lastError: error,
      serverOrder,
    }));
}

export function applyChangePage(
  options: ApplyChangePageOptions,
): Promise<ChangePageResult> {
  const { backend, hubId, since, page } = options;
  assertPageIsOrdered(page, since);
  for (const change of page.changes) {
    assertHub(change, hubId);
  }

  return backend.runTransaction(
    ["orders", "mutations", "meta"],
    "readwrite",
    async (tx) => {
      let applied = 0;
      let conflicts = 0;

      for (const change of page.changes) {
        assertHub(change, hubId);
        const local = await tx.getOrder(change.orderId);
        const mutations = await tx.listMutations(change.orderId);
        const pending = mutations.filter(
          (mutation) => mutation.status === "pending",
        );

        if (change.operation === "delete") {
          if (pending.length > 0) {
            for (const mutation of conflictMutations(
              pending,
              "ORDER_DELETED",
              null,
            )) {
              await tx.putMutation(mutation);
            }
            conflicts += 1;
          }
          await tx.deleteOrder(change.orderId);
          applied += 1;
          continue;
        }

        const serverOrder = change.order;
        if (pending.length > 0) {
          const serverIsNewer = !local || change.version > local.version;
          if (serverIsNewer) {
            const canonical = localOrderFromServer(serverOrder, "conflict");
            for (const mutation of conflictMutations(
              pending,
              `Server version ${change.version} is newer than local version ${local?.version ?? 0}`,
              canonical,
            )) {
              await tx.putMutation(mutation);
            }
            await tx.putOrder(
              local
                ? {
                    ...local,
                    syncState: "conflict",
                    lastError: `Server version ${change.version} is newer than local version ${local.version}`,
                  }
                : { ...canonical, syncState: "conflict" },
            );
            conflicts += 1;
          }
        } else {
          await tx.putOrder(localOrderFromServer(serverOrder));
        }
        applied += 1;
      }

      await tx.setMeta("cursor", page.nextCursor);
      await tx.setMeta("hubId", hubId);
      await tx.setMeta("lastSyncedAt", options.now ?? Date.now());

      return { applied, conflicts, cursor: page.nextCursor };
    },
  );
}

export async function pullChangeFeed(
  options: ChangeFeedPullOptions,
): Promise<ChangeFeedPullResult> {
  const limit = options.limit ?? 100;
  const maxPages = options.maxPages ?? 100;
  const scopedHub = await options.backend.getMeta("hubId");
  if (typeof scopedHub === "string" && scopedHub !== options.hubId) {
    throw new Error(
      `Local storage belongs to hub ${scopedHub}, not ${options.hubId}`,
    );
  }

  let cursor = Number((await options.backend.getMeta("cursor")) ?? 0);
  if (!Number.isInteger(cursor) || cursor < 0) {
    cursor = 0;
  }

  let pages = 0;
  let applied = 0;
  let conflicts = 0;

  while (pages < maxPages) {
    const response = changeFeedResponseSchema.parse(
      await options.client.fetchPage(cursor, limit),
    );
    if (response.hasMore && response.changes.length === 0) {
      throw new Error("Change feed made no progress while reporting more pages");
    }

    const result = await applyChangePage({
      backend: options.backend,
      hubId: options.hubId,
      since: cursor,
      page: response,
      now: options.now,
    });
    pages += 1;
    applied += result.applied;
    conflicts += result.conflicts;
    cursor = result.cursor;

    if (!response.hasMore) {
      break;
    }
  }

  return { pages, applied, conflicts, cursor };
}

export interface ApplyOrderSnapshotOptions {
  backend: StorageBackend;
  hubId: string;
  cursor: number;
  orders: OrderSummary[];
  now?: number;
}

export interface SnapshotResult {
  applied: number;
  conflicts: number;
  cursor: number;
}

export function applyOrderSnapshot(
  options: ApplyOrderSnapshotOptions,
): Promise<SnapshotResult> {
  if (!Number.isInteger(options.cursor) || options.cursor < 0) {
    return Promise.reject(new Error("Snapshot cursor must be non-negative"));
  }
  for (const order of options.orders) {
    if (order.hubId !== options.hubId) {
      return Promise.reject(
        new Error(
          `Snapshot hub mismatch: expected ${options.hubId}, received ${order.hubId}`,
        ),
      );
    }
  }

  return options.backend.runTransaction(
    ["orders", "mutations", "meta"],
    "readwrite",
    async (tx) => {
      const snapshotIds = new Set(options.orders.map((order) => order.id));
      let conflicts = 0;

      for (const local of await tx.listOrders()) {
        if (snapshotIds.has(local.id)) {
          continue;
        }
        const pending = (
          await tx.listMutations(local.id)
        ).filter((mutation) => mutation.status === "pending");
        if (pending.length === 0) {
          await tx.deleteOrder(local.id);
        }
      }

      for (const serverOrder of options.orders) {
        const local = await tx.getOrder(serverOrder.id);
        const pending = (
          await tx.listMutations(serverOrder.id)
        ).filter((mutation) => mutation.status === "pending");

        if (pending.length > 0) {
          const serverIsNewer = !local || serverOrder.version > local.version;
          if (serverIsNewer) {
            const canonical = localOrderFromServer(serverOrder, "conflict");
            for (const mutation of conflictMutations(
              pending,
              `Server version ${serverOrder.version} is newer than local version ${local?.version ?? 0}`,
              canonical,
            )) {
              await tx.putMutation(mutation);
            }
            await tx.putOrder(
              local
                ? {
                    ...local,
                    syncState: "conflict",
                    lastError: `Server version ${serverOrder.version} is newer than local version ${local.version}`,
                  }
                : canonical,
            );
            conflicts += 1;
          }
          continue;
        }

        await tx.putOrder(localOrderFromServer(serverOrder));
      }

      await tx.setMeta("cursor", options.cursor);
      await tx.setMeta("hubId", options.hubId);
      await tx.setMeta("lastSyncedAt", options.now ?? Date.now());
      await tx.setMeta("snapshotAt", options.now ?? Date.now());

      return {
        applied: options.orders.length,
        conflicts,
        cursor: options.cursor,
      };
    },
  );
}
