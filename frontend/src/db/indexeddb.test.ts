import { describe, it, expect, beforeEach } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import Dexie from "dexie";
import { createIndexedDbBackend } from "./indexeddb";
import type { LocalOrder, PendingMutation } from "../sync/types";

describe("createIndexedDbBackend", () => {
  const testDbName = "test-indexeddb-backend";

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const req = fakeIndexedDB.deleteDatabase(testDbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  it("initializes an empty database and supports order CRUD", async () => {
    const backend = createIndexedDbBackend(fakeIndexedDB, {
      databaseName: testDbName,
    });

    const order: LocalOrder = {
      id: "ord-1",
      hubId: "hub-1",
      customerId: "cust-1",
      customerName: "Alice",
      customerPhone: "9876543210",
      status: "confirmed",
      serviceType: "wash_and_fold",
      deliverySlotId: "slot-1",
      deliveryAt: 123456789,
      version: 1,
      holdComment: null,
      createdAt: 1000,
      updatedAt: 1000,
      syncState: "pending",
    };

    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(order);
    });

    const retrieved = await backend.getOrder("ord-1");
    expect(retrieved).toEqual(order);

    const all = await backend.listOrders();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("ord-1");

    await backend.deleteOrder("ord-1");
    const afterDelete = await backend.getOrder("ord-1");
    expect(afterDelete).toBeUndefined();
  });

  it("supports mutation CRUD and index lookup by orderId", async () => {
    const backend = createIndexedDbBackend(fakeIndexedDB, {
      databaseName: testDbName,
    });

    const mutation1: PendingMutation = {
      mutationId: "mut-1",
      orderId: "ord-100",
      intent: "markProcessing",
      baseVersion: 1,
      createdAt: 1000,
      payload: {},
      status: "pending",
      attempts: 0,
    };
    const mutation2: PendingMutation = {
      mutationId: "mut-2",
      orderId: "ord-200",
      intent: "markDelivered",
      baseVersion: 1,
      createdAt: 2000,
      payload: {},
      status: "pending",
      attempts: 0,
    };

    await backend.runTransaction(["mutations"], "readwrite", async (tx) => {
      await tx.putMutation(mutation1);
      await tx.putMutation(mutation2);
    });

    const single = await backend.getMutation("mut-1");
    expect(single?.mutationId).toBe("mut-1");

    const forOrder = await backend.listMutations("ord-100");
    expect(forOrder).toHaveLength(1);
    expect(forOrder[0].mutationId).toBe("mut-1");

    const all = await backend.listMutations();
    expect(all).toHaveLength(2);

    await backend.deleteMutation("mut-1");
    const remaining = await backend.listMutations();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].mutationId).toBe("mut-2");
  });

  it("supports meta key-value storage", async () => {
    const backend = createIndexedDbBackend(fakeIndexedDB, {
      databaseName: testDbName,
    });

    await backend.setMeta("lastSyncCursor", 42);
    expect(await backend.getMeta("lastSyncCursor")).toBe(42);
    expect(await backend.getMeta("non_existent")).toBeUndefined();
  });

  it("coexists seamlessly when Dexie upgrades the database to version 2", async () => {
    // 1. Raw backend writes an order
    const backend = createIndexedDbBackend(fakeIndexedDB, {
      databaseName: testDbName,
    });

    const sampleOrder: LocalOrder = {
      id: "order-coexist",
      hubId: "hub-1",
      customerId: "cust-1",
      customerName: "Bob",
      customerPhone: "9876543210",
      status: "confirmed",
      serviceType: "wash_and_fold",
      deliverySlotId: null,
      deliveryAt: null,
      version: 1,
      holdComment: null,
      createdAt: 1000,
      updatedAt: 1000,
      syncState: "pending",
    };
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(sampleOrder);
    });

    // 2. Dexie opens and upgrades the database to multi-tenant v2
    const dexieDb = new Dexie(testDbName, { indexedDB: fakeIndexedDB });
    dexieDb.version(1).stores({
      orders: "id",
      mutations: "mutationId, orderId",
      meta: "key",
    });
    dexieDb.version(2).stores({
      tenants: "id, slug",
      orders: "id, tenantId, status",
      mutations: "mutationId, orderId",
      meta: "key",
    });

    await dexieDb.open();
    // Dexie can write to its tables
    await dexieDb.table("tenants").put({ id: "t-1", slug: "main" });
    dexieDb.close();

    // 3. Raw backend can still read its order and write new orders without VersionError!
    const retrieved = await backend.getOrder("order-coexist");
    expect(retrieved?.id).toBe("order-coexist");

    await backend.setMeta("afterUpgrade", "works");
    expect(await backend.getMeta("afterUpgrade")).toBe("works");
  });

  it("opens without error when Dexie initialized the database first", async () => {
    // 1. Dexie initializes v2 first
    const dexieDb = new Dexie(testDbName, { indexedDB: fakeIndexedDB });
    dexieDb.version(1).stores({
      orders: "id",
      mutations: "mutationId, orderId",
      meta: "key",
    });
    dexieDb.version(2).stores({
      tenants: "id, slug",
      orders: "id, tenantId, status",
      mutations: "mutationId, orderId",
      meta: "key",
    });
    await dexieDb.open();
    await dexieDb.table("orders").put({ id: "dexie-order-1", status: "ready" });
    dexieDb.close();

    // 2. Raw backend opens without VersionError and reads the record
    const backend = createIndexedDbBackend(fakeIndexedDB, {
      databaseName: testDbName,
    });
    const order = await backend.getOrder("dexie-order-1");
    expect(order).toMatchObject({ id: "dexie-order-1", status: "ready" });
  });

  it("throws when factory is not available", () => {
    expect(() => createIndexedDbBackend(null)).toThrow(
      "IndexedDB is not available in this environment",
    );
  });
});
