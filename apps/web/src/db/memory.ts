import type {
  StorageBackend,
  StoreName,
  TransactionContext,
  TransactionMode,
} from "./types";
import type { LocalOrder, PendingMutation } from "../sync/types";

export interface MemoryStorageBackend extends StorageBackend {
  readonly orders: Map<string, LocalOrder>;
  readonly mutations: Map<string, PendingMutation>;
  readonly meta: Map<string, unknown>;
}

export function createMemoryStorageBackend(): MemoryStorageBackend {
  const orders = new Map<string, LocalOrder>();
  const mutations = new Map<string, PendingMutation>();
  const meta = new Map<string, unknown>();

  const context: TransactionContext = {
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

  async function runTransaction<T>(
    stores: StoreName | StoreName[],
    _mode: TransactionMode,
    fn: (tx: TransactionContext) => Promise<T> | T,
  ): Promise<T> {
    const names = Array.isArray(stores) ? stores : [stores];
    const snapshots = {
      orders: new Map(orders),
      mutations: new Map(mutations),
      meta: new Map(meta),
    };

    try {
      return await fn(context);
    } catch (error) {
      for (const name of names) {
        if (name === "orders") {
          orders.clear();
          for (const [key, value] of snapshots.orders) orders.set(key, value);
        }
        if (name === "mutations") {
          mutations.clear();
          for (const [key, value] of snapshots.mutations) {
            mutations.set(key, value);
          }
        }
        if (name === "meta") {
          meta.clear();
          for (const [key, value] of snapshots.meta) meta.set(key, value);
        }
      }
      throw error;
    }
  }

  return {
    orders,
    mutations,
    meta,
    runTransaction,
    getOrder: (id) => context.getOrder(id),
    listOrders: () => context.listOrders(),
    deleteOrder: (id) => context.deleteOrder(id),
    getMutation: (id) => context.getMutation(id),
    listMutations: (orderId) => context.listMutations(orderId),
    deleteMutation: (id) => context.deleteMutation(id),
    getMeta: (key) => context.getMeta(key),
    setMeta: (key, value) => context.setMeta(key, value),
  };
}
