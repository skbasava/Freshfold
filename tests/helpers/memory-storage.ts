import type {
  StorageBackend,
  StoreName,
  TransactionContext,
  TransactionMode,
} from "../../frontend/src/db/types";
import type {
  LocalOrder,
  PendingMutation,
} from "../../frontend/src/sync/types";

export interface MemoryStats {
  transactions: number;
  lastStores: StoreName[];
  lastMode: TransactionMode | null;
}

export interface MemoryBackend {
  backend: StorageBackend;
  stats: MemoryStats;
  orders: Map<string, LocalOrder>;
  mutations: Map<string, PendingMutation>;
  meta: Map<string, unknown>;
  clear(): void;
}

export function createMemoryBackend(): MemoryBackend {
  const orders = new Map<string, LocalOrder>();
  const mutations = new Map<string, PendingMutation>();
  const meta = new Map<string, unknown>();

  const stats: MemoryStats = {
    transactions: 0,
    lastStores: [],
    lastMode: null,
  };

  function contextFor(): TransactionContext {
    return {
      async getOrder(id) {
        return orders.get(id);
      },
      async putOrder(order) {
        orders.set(order.id, order);
      },
      async deleteOrder(id) {
        orders.delete(id);
      },
      async listOrders() {
        return [...orders.values()];
      },
      async getMutation(id) {
        return mutations.get(id);
      },
      async putMutation(mutation) {
        mutations.set(mutation.mutationId, mutation);
      },
      async deleteMutation(id) {
        mutations.delete(id);
      },
      async listMutations(orderId) {
        const all = [...mutations.values()];
        return orderId === undefined
          ? all
          : all.filter((mutation) => mutation.orderId === orderId);
      },
      async getMeta(key) {
        return meta.get(key);
      },
      async setMeta(key, value) {
        meta.set(key, value);
      },
    };
  }

  const backend: StorageBackend = {
    async runTransaction(stores, mode, fn) {
      const names = Array.isArray(stores) ? stores : [stores];
      const storeSet = new Set<StoreName>(names);
      stats.transactions += 1;
      stats.lastStores = names;
      stats.lastMode = mode;

      const snapshotOrders = new Map(orders);
      const snapshotMutations = new Map(mutations);
      const snapshotMeta = new Map(meta);

      try {
        return await fn(contextFor());
      } catch (error) {
        if (storeSet.has("orders")) {
          orders.clear();
          for (const [key, value] of snapshotOrders) orders.set(key, value);
        }
        if (storeSet.has("mutations")) {
          mutations.clear();
          for (const [key, value] of snapshotMutations) {
            mutations.set(key, value);
          }
        }
        if (storeSet.has("meta")) {
          meta.clear();
          for (const [key, value] of snapshotMeta) meta.set(key, value);
        }
        throw error;
      }
    },
    async getOrder(id) {
      return orders.get(id);
    },
    async listOrders() {
      return [...orders.values()];
    },
    async deleteOrder(id) {
      orders.delete(id);
    },
    async getMutation(id) {
      return mutations.get(id);
    },
    async listMutations(orderId) {
      const all = [...mutations.values()];
      return orderId === undefined
        ? all
        : all.filter((mutation) => mutation.orderId === orderId);
    },
    async deleteMutation(id) {
      mutations.delete(id);
    },
    async getMeta(key) {
      return meta.get(key);
    },
    async setMeta(key, value) {
      meta.set(key, value);
    },
  };

  return {
    backend,
    stats,
    orders,
    mutations,
    meta,
    clear() {
      orders.clear();
      mutations.clear();
      meta.clear();
    },
  };
}

export function makeLocalOrder(
  overrides: Partial<LocalOrder> = {},
): LocalOrder {
  return {
    id: "order-1",
    hubId: "hub-1",
    customerId: "cust-1",
    customerName: "Alice",
    customerPhone: "+919000000001",
    status: "confirmed",
    serviceType: "wash_fold",
    deliverySlotId: null,
    deliveryAt: null,
    version: 1,
    holdComment: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    syncState: "pending",
    lastError: null,
    ...overrides,
  };
}
