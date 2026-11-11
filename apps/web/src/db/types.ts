import type { LocalOrder, PendingMutation } from "../sync/types";

export type StoreName = "orders" | "mutations" | "meta";

export type TransactionMode = "readwrite" | "readonly";

export interface TransactionContext {
  getOrder(id: string): Promise<LocalOrder | undefined>;
  putOrder(order: LocalOrder): Promise<void>;
  deleteOrder(id: string): Promise<void>;
  listOrders(): Promise<LocalOrder[]>;
  getMutation(id: string): Promise<PendingMutation | undefined>;
  putMutation(mutation: PendingMutation): Promise<void>;
  deleteMutation(id: string): Promise<void>;
  listMutations(orderId?: string): Promise<PendingMutation[]>;
  getMeta(key: string): Promise<unknown>;
  setMeta(key: string, value: unknown): Promise<void>;
}

export interface StorageBackend {
  runTransaction<T>(
    stores: StoreName | StoreName[],
    mode: TransactionMode,
    fn: (tx: TransactionContext) => Promise<T> | T,
  ): Promise<T>;
  getOrder(id: string): Promise<LocalOrder | undefined>;
  listOrders(): Promise<LocalOrder[]>;
  deleteOrder(id: string): Promise<void>;
  getMutation(id: string): Promise<PendingMutation | undefined>;
  listMutations(orderId?: string): Promise<PendingMutation[]>;
  deleteMutation(id: string): Promise<void>;
  getMeta(key: string): Promise<unknown>;
  setMeta(key: string, value: unknown): Promise<void>;
}
