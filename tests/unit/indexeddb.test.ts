import { describe, expect, it } from "vitest";
import {
  createMutationId,
  createMutationQueue,
  createPendingMutation,
} from "../../frontend/src/sync/mutation-queue";
import { isServerConfirmed } from "../../frontend/src/sync/types";
import type {
  LocalOrder,
  PendingMutation,
} from "../../frontend/src/sync/types";

import {
  createMemoryBackend,
} from "../helpers/memory-storage";

function makeOrder(overrides: Partial<LocalOrder> = {}): LocalOrder {
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

function makeMutation(orderId = "order-1"): PendingMutation {
  return createPendingMutation({
    orderId,
    intent: "reschedule",
    payload: { deliverySlotId: "slot-2" },
    baseVersion: 1,
    now: 1_000,
  });
}

describe("mutation identity", () => {
  it("creates a pending mutation with a UUID mutation id", () => {
    const mutation = makeMutation();

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(mutation.mutationId).toMatch(uuidPattern);
    expect(createMutationId()).toMatch(uuidPattern);
    expect(mutation.status).toBe("pending");
    expect(mutation.attempts).toBe(0);
    expect(mutation.createdAt).toBe(1_000);
  });
});

describe("optimistic enqueue", () => {
  it("writes the order and mutation in exactly one readwrite transaction", async () => {
    const { backend, stats } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    const order = makeOrder();
    const mutation = makeMutation();

    const persisted = await queue.enqueueOptimistic(order, mutation);

    expect(stats.transactions).toBe(1);
    expect(stats.lastMode).toBe("readwrite");
    expect([...stats.lastStores].sort()).toEqual(["mutations", "orders"]);
    expect(persisted.order.syncState).toBe("pending");
    expect(persisted.mutation.mutationId).toBe(mutation.mutationId);
    expect(await queue.getOrder(order.id)).toMatchObject({
      id: order.id,
      syncState: "pending",
    });
    expect(await queue.getMutation(mutation.mutationId)).toMatchObject({
      mutationId: mutation.mutationId,
      status: "pending",
    });
  });

  it("never marks a newly enqueued order as server confirmed", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);

    const persisted = await queue.enqueueOptimistic(
      makeOrder({ syncState: "synced" }),
      makeMutation(),
    );

    expect(persisted.order.syncState).toBe("pending");
    expect(isServerConfirmed(persisted.order)).toBe(false);
    const stored = await queue.getOrder("order-1");
    expect(stored).toBeDefined();
    expect(isServerConfirmed(stored!)).toBe(false);
  });

  it("rejects a mutation that targets a different order", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);

    await expect(
      queue.enqueueOptimistic(makeOrder(), makeMutation("order-2")),
    ).rejects.toThrow(/order/i);
  });
});

describe("transaction atomicity", () => {
  it("persists neither the order nor the mutation when the transaction aborts", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    const order = makeOrder();
    const mutation = makeMutation();

    await expect(
      backend.runTransaction(
        ["orders", "mutations"],
        "readwrite",
        async (tx) => {
          await tx.putOrder(order);
          await tx.putMutation(mutation);
          throw new Error("simulated abort");
        },
      ),
    ).rejects.toThrow("simulated abort");

    expect(await queue.getOrder(order.id)).toBeUndefined();
    expect(await queue.getMutation(mutation.mutationId)).toBeUndefined();
  });
});

describe("mutation retries", () => {
  it("keeps a stable mutation id while attempts increment", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    const mutation = makeMutation();
    await queue.enqueueOptimistic(makeOrder(), mutation);

    const first = await queue.recordAttempt(mutation.mutationId);
    const second = await queue.recordAttempt(mutation.mutationId);

    expect(first.mutationId).toBe(mutation.mutationId);
    expect(second.mutationId).toBe(mutation.mutationId);
    expect(second.attempts).toBe(2);
    expect(second.status).toBe("pending");
    expect(await queue.listMutations("order-1")).toHaveLength(1);
  });
});

describe("terminal mutation states", () => {
  it("preserves a rejected mutation and never confirms the order", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    const mutation = makeMutation();
    await queue.enqueueOptimistic(makeOrder(), mutation);

    const rejected = await queue.markRejected(
      mutation.mutationId,
      "slot unavailable",
    );

    expect(rejected.mutationId).toBe(mutation.mutationId);
    expect(rejected.status).toBe("rejected");
    expect(rejected.lastError).toBe("slot unavailable");
    expect(await queue.getMutation(mutation.mutationId)).toEqual(rejected);
    const order = await queue.getOrder("order-1");
    expect(order).toBeDefined();
    expect(isServerConfirmed(order!)).toBe(false);
  });

  it("preserves a conflicted mutation and never confirms the order", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    const mutation = makeMutation();
    await queue.enqueueOptimistic(makeOrder(), mutation);

    const conflict = await queue.markConflict(
      mutation.mutationId,
      "version mismatch",
    );

    expect(conflict.mutationId).toBe(mutation.mutationId);
    expect(conflict.status).toBe("conflict");
    expect(conflict.lastError).toBe("version mismatch");
    expect(await queue.getMutation(mutation.mutationId)).toEqual(conflict);
    const order = await queue.getOrder("order-1");
    expect(order).toBeDefined();
    expect(isServerConfirmed(order!)).toBe(false);
  });

  it("marks the mutation and related order synced in one transaction", async () => {
    const { backend, stats } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    const mutation = makeMutation();
    await queue.enqueueOptimistic(makeOrder(), mutation);
    const before = stats.transactions;

    const synced = await queue.markSynced(mutation.mutationId, {
      orderVersion: 3,
    });

    expect(stats.transactions).toBe(before + 1);
    expect(stats.lastMode).toBe("readwrite");
    expect([...stats.lastStores].sort()).toEqual(["mutations", "orders"]);
    expect(synced.mutationId).toBe(mutation.mutationId);
    expect(synced.status).toBe("synced");
    expect(await queue.getMutation(mutation.mutationId)).toEqual(synced);

    const order = await queue.getOrder("order-1");
    expect(order).toMatchObject({
      id: "order-1",
      syncState: "synced",
      version: 3,
    });
    expect(isServerConfirmed(order!)).toBe(true);
  });
});

describe("mutation listing", () => {
  it("filters mutations by order id", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);

    await queue.enqueueOptimistic(makeOrder(), makeMutation("order-1"));
    await queue.enqueueOptimistic(
      makeOrder({ id: "order-2" }),
      makeMutation("order-2"),
    );

    const forOrder1 = await queue.listMutations("order-1");
    expect(forOrder1).toHaveLength(1);
    expect(forOrder1[0]?.orderId).toBe("order-1");
    expect(await queue.listMutations()).toHaveLength(2);
  });
});
