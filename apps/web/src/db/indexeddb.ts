import type { LocalOrder, PendingMutation } from "../sync/types";
import type {
  StorageBackend,
  StoreName,
  TransactionContext,
  TransactionMode,
} from "./types";

const DB_NAME = "freshfold-laundry";
const DB_VERSION = 1;

interface MetaRecord {
  key: string;
  value: unknown;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transact<T>(
  db: IDBDatabase,
  stores: StoreName[],
  mode: TransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    let succeeded = false;
    let result: T;
    let fnError: unknown;

    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      if (succeeded) resolve(result);
      else reject(fnError ?? new Error("IndexedDB transaction did not commit"));
    };
    tx.onabort = () => {
      if (settled) return;
      settled = true;
      reject(
        tx.error ??
          fnError ??
          new Error("IndexedDB transaction aborted"),
      );
    };
    tx.onerror = () => {
      // The abort handler reports the failure after the transaction unwinds.
    };

    void (async () => {
      try {
        result = await fn(tx);
        succeeded = true;
      } catch (error) {
        fnError = error;
        try {
          tx.abort();
        } catch {
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      }
    })();
  });
}

function createTransactionContext(tx: IDBTransaction): TransactionContext {
  return {
    async getOrder(id) {
      const request = tx.objectStore("orders").get(id);
      return (await requestResult(request)) as LocalOrder | undefined;
    },
    async putOrder(order) {
      await requestResult(tx.objectStore("orders").put(order));
    },
    async deleteOrder(id) {
      await requestResult(tx.objectStore("orders").delete(id));
    },
    async listOrders() {
      const request = tx.objectStore("orders").getAll();
      return (await requestResult(request)) as LocalOrder[];
    },
    async getMutation(id) {
      const request = tx.objectStore("mutations").get(id);
      return (await requestResult(request)) as PendingMutation | undefined;
    },
    async putMutation(mutation) {
      await requestResult(tx.objectStore("mutations").put(mutation));
    },
    async deleteMutation(id) {
      await requestResult(tx.objectStore("mutations").delete(id));
    },
    async listMutations(orderId) {
      const store = tx.objectStore("mutations");
      const request =
        orderId === undefined
          ? store.getAll()
          : store.index("orderId").getAll(orderId);
      return (await requestResult(request)) as PendingMutation[];
    },
    async getMeta(key) {
      const record = (await requestResult(
        tx.objectStore("meta").get(key),
      )) as MetaRecord | undefined;
      return record?.value;
    },
    async setMeta(key, value) {
      await requestResult(
        tx.objectStore("meta").put({ key, value } satisfies MetaRecord),
      );
    },
  };
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("orders")) {
        db.createObjectStore("orders", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("mutations")) {
        const mutations = db.createObjectStore("mutations", {
          keyPath: "mutationId",
        });
        mutations.createIndex("orderId", "orderId", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    request.onblocked = () =>
      reject(new Error("IndexedDB open blocked by another connection"));
  });
}

export function createIndexedDbBackend(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): StorageBackend {
  if (!factory) {
    throw new Error("IndexedDB is not available in this environment");
  }

  const database = openDatabase(factory);

  function run<T>(
    stores: StoreName[],
    mode: TransactionMode,
    fn: (tx: IDBTransaction) => Promise<T> | T,
  ): Promise<T> {
    return database.then((db) => transact(db, stores, mode, fn));
  }

  return {
    runTransaction(stores, mode, fn) {
      const names = Array.isArray(stores) ? stores : [stores];
      return run(names, mode, (tx) => fn(createTransactionContext(tx)));
    },
    getOrder(id) {
      return run(["orders"], "readonly", (tx) =>
        createTransactionContext(tx).getOrder(id),
      );
    },
    listOrders() {
      return run(["orders"], "readonly", (tx) =>
        createTransactionContext(tx).listOrders(),
      );
    },
    deleteOrder(id) {
      return run(["orders"], "readwrite", (tx) =>
        createTransactionContext(tx).deleteOrder(id),
      );
    },
    getMutation(id) {
      return run(["mutations"], "readonly", (tx) =>
        createTransactionContext(tx).getMutation(id),
      );
    },
    listMutations(orderId) {
      return run(["mutations"], "readonly", (tx) =>
        createTransactionContext(tx).listMutations(orderId),
      );
    },
    deleteMutation(id) {
      return run(["mutations"], "readwrite", (tx) =>
        createTransactionContext(tx).deleteMutation(id),
      );
    },
    getMeta(key) {
      return run(["meta"], "readonly", (tx) =>
        createTransactionContext(tx).getMeta(key),
      );
    },
    setMeta(key, value) {
      return run(["meta"], "readwrite", (tx) =>
        createTransactionContext(tx).setMeta(key, value),
      );
    },
  };
}
