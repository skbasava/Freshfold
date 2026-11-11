import { describe, expect, it } from "vitest";
import type { ApplyChangeInput } from "../../packages/contracts/src/mutations";
import type { OrderDetail } from "../../packages/contracts/src/orders";
import { createMutationQueue } from "../../apps/web/src/sync/mutation-queue";
import {
  createOfflineOrder,
  updateOfflineOrder,
} from "../../apps/web/src/orders/offline";
import {
  createReconnectFlush,
  flushPendingMutations,
  type MutationTransport,
  type MutationTransportResult,
} from "../../apps/web/src/sync/submit";
import { isServerConfirmed } from "../../apps/web/src/sync/types";
import {
  createMemoryBackend,
  makeLocalOrder,
} from "../helpers/memory-storage";

function serverOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: "order-1",
    hubId: "hub-1",
    customerId: "cust-1",
    customerName: "Alice",
    customerPhone: "+919000000001",
    status: "confirmed",
    serviceType: "wash_fold",
    deliverySlotId: "slot-1",
    deliveryAt: null,
    version: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    cancelledAt: null,
    holdComment: null,
    customer: {
      id: "cust-1",
      hubId: "hub-1",
      name: "Alice",
      phone: "+919000000001",
      notes: null,
      createdAt: 1_000,
      updatedAt: 1_000,
    },
    items: [],
    ...overrides,
  };
}

function scriptedTransport(
  results: MutationTransportResult[],
): MutationTransport & { sent: ApplyChangeInput[] } {
  const sent: ApplyChangeInput[] = [];
  return {
    sent,
    async send(input) {
      sent.push(input);
      const result = results.shift();
      if (!result) throw new Error("No scripted transport result");
      return result;
    },
  };
}

describe("offline order creation", () => {
  it("creates an order and pending mutation without claiming server confirmation", async () => {
    const { backend, stats } = createMemoryBackend();
    const queue = createMutationQueue(backend);

    const result = await createOfflineOrder(queue, {
      hubId: "hub-1",
      customerId: "cust-1",
      customerName: "Alice",
      customerPhone: "+919000000001",
      serviceType: "wash_fold",
      deliverySlotId: "slot-1",
      items: [{ description: "Shirt", quantity: 2 }],
      now: 1_000,
    });

    expect(result.order.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(result.order.syncState).toBe("pending");
    expect(isServerConfirmed(result.order)).toBe(false);
    expect(result.mutation).toMatchObject({
      orderId: result.order.id,
      intent: "createOrder",
      baseVersion: null,
      status: "pending",
      attempts: 0,
    });
    expect(result.mutation.payload).toMatchObject({
      customerId: "cust-1",
      serviceType: "wash_fold",
      deliverySlotId: "slot-1",
      items: [{ description: "Shirt", quantity: 2 }],
    });
    expect(stats.transactions).toBe(1);
    expect(await queue.getMutation(result.mutation.mutationId)).toEqual(
      result.mutation,
    );
  });

  it("rejects an invalid offline order before writing anything", async () => {
    const { backend, orders, mutations } = createMemoryBackend();
    const queue = createMutationQueue(backend);

    await expect(
      createOfflineOrder(queue, {
        hubId: "hub-1",
        customerId: "cust-1",
        customerName: "Alice",
        customerPhone: "+919000000001",
        serviceType: "wash_fold",
        deliverySlotId: "slot-1",
        items: [],
        now: 1_000,
      }),
    ).rejects.toThrow(/invalid/i);

    expect(orders.size).toBe(0);
    expect(mutations.size).toBe(0);
  });
});

describe("offline order updates", () => {
  it("captures each update with a stable per-order base version", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(makeLocalOrder({ syncState: "synced" }));
    });

    const first = await updateOfflineOrder(queue, {
      orderId: "order-1",
      intent: "markProcessing",
      payload: {},
      now: 100,
    });
    const second = await updateOfflineOrder(queue, {
      orderId: "order-1",
      intent: "placeOnHold",
      payload: { comments: "Customer called" },
      now: 200,
    });
    const third = await updateOfflineOrder(queue, {
      orderId: "order-1",
      intent: "releaseHold",
      payload: {},
      now: 300,
    });

    expect([first.mutation.baseVersion, second.mutation.baseVersion, third.mutation.baseVersion]).toEqual([
      1, 2, 3,
    ]);
    expect([first.order.version, second.order.version, third.order.version]).toEqual([
      2, 3, 4,
    ]);
    expect(third.order).toMatchObject({
      status: "processing",
      syncState: "pending",
      holdComment: null,
    });
  });

  it("sends queued updates in creation order per order", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(makeLocalOrder({ syncState: "synced" }));
    });

    await updateOfflineOrder(queue, {
      orderId: "order-1",
      intent: "markProcessing",
      payload: {},
      now: 100,
    });
    await updateOfflineOrder(queue, {
      orderId: "order-1",
      intent: "placeOnHold",
      payload: { comments: "Hold" },
      now: 200,
    });
    await updateOfflineOrder(queue, {
      orderId: "order-1",
      intent: "releaseHold",
      payload: {},
      now: 300,
    });

    const transport = scriptedTransport([
      { kind: "accepted", replayed: false, order: serverOrder({ status: "processing", version: 2 }) },
      { kind: "accepted", replayed: false, order: serverOrder({ status: "hold", version: 3 }) },
      { kind: "accepted", replayed: false, order: serverOrder({ status: "processing", version: 4 }) },
    ]);

    const summary = await flushPendingMutations({ queue, transport });

    expect(transport.sent.map((input) => input.intent)).toEqual([
      "markProcessing",
      "placeOnHold",
      "releaseHold",
    ]);
    expect(transport.sent.map((input) => input.baseVersion)).toEqual([1, 2, 3]);
    expect(summary).toMatchObject({ attempted: 3, synced: 3, rejected: 0, conflicts: 0 });
    const order = await queue.getOrder("order-1");
    expect(order).toMatchObject({ syncState: "synced", version: 4 });
  });
});

describe("reconnect flush", () => {
  it("flushes the pending queue when connectivity returns", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    const created = await createOfflineOrder(queue, {
      hubId: "hub-1",
      customerId: "cust-1",
      customerName: "Alice",
      customerPhone: "+919000000001",
      serviceType: "wash_fold",
      deliverySlotId: "slot-1",
      items: [{ description: "Shirt", quantity: 1 }],
      now: 1_000,
    });

    const transport = scriptedTransport([
      { kind: "accepted", replayed: false, order: serverOrder({ id: created.order.id }) },
    ]);
    const target = new EventTarget();
    const reconnect = createReconnectFlush({ queue, transport, target });

    target.dispatchEvent(new Event("online"));
    await reconnect.idle();

    expect(transport.sent).toHaveLength(1);
    const stored = await queue.getOrder(created.order.id);
    expect(stored?.syncState).toBe("synced");
    reconnect.dispose();
  });
});

describe("mutation response handling", () => {
  it("keeps a stable mutation id while a retryable failure is retried", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    const created = await createOfflineOrder(queue, {
      hubId: "hub-1",
      customerId: "cust-1",
      customerName: "Alice",
      customerPhone: "+919000000001",
      serviceType: "wash_fold",
      deliverySlotId: "slot-1",
      items: [{ description: "Shirt", quantity: 1 }],
      now: 1_000,
    });
    const transport = scriptedTransport([
      { kind: "retryable", error: "network down" },
      { kind: "accepted", replayed: false, order: serverOrder({ id: created.order.id }) },
    ]);

    const first = await flushPendingMutations({ queue, transport });
    expect(first).toMatchObject({ attempted: 1, synced: 0, retryable: 1 });
    expect((await queue.getMutation(created.mutation.mutationId))?.status).toBe(
      "pending",
    );
    expect((await queue.getOrder(created.order.id))?.syncState).toBe("pending");

    const second = await flushPendingMutations({ queue, transport });
    expect(second).toMatchObject({ attempted: 1, synced: 1 });

    expect(transport.sent.map((input) => input.mutationId)).toEqual([
      created.mutation.mutationId,
      created.mutation.mutationId,
    ]);
    expect(
      (await queue.getMutation(created.mutation.mutationId))?.attempts,
    ).toBe(2);
  });

  it("preserves a 409 version conflict and keeps the local order provisional", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(makeLocalOrder({ syncState: "synced", customerName: "Local Alice" }));
    });
    const update = await updateOfflineOrder(queue, {
      orderId: "order-1",
      intent: "markProcessing",
      payload: {},
      now: 100,
    });
    const transport = scriptedTransport([
      {
        kind: "version_conflict",
        error: "VERSION_CONFLICT",
        order: serverOrder({ version: 2, customerName: "Server Alice" }),
      },
    ]);

    const summary = await flushPendingMutations({ queue, transport });

    expect(summary).toMatchObject({ conflicts: 1, synced: 0 });
    const mutation = await queue.getMutation(update.mutation.mutationId);
    expect(mutation).toMatchObject({
      status: "conflict",
      lastError: "VERSION_CONFLICT",
      serverOrder: { version: 2, customerName: "Server Alice" },
    });
    const order = await queue.getOrder("order-1");
    expect(order).toMatchObject({
      syncState: "conflict",
      customerName: "Local Alice",
    });
    expect(isServerConfirmed(order!)).toBe(false);
  });

  it("preserves a 422 rejection with its reason and never confirms the order", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    const created = await createOfflineOrder(queue, {
      hubId: "hub-1",
      customerId: "cust-1",
      customerName: "Alice",
      customerPhone: "+919000000001",
      serviceType: "wash_fold",
      deliverySlotId: "slot-1",
      items: [{ description: "Shirt", quantity: 1 }],
      now: 1_000,
    });
    const transport = scriptedTransport([
      { kind: "rejected", status: 422, error: "SLOT_FULL" },
    ]);

    const summary = await flushPendingMutations({ queue, transport });

    expect(summary).toMatchObject({ rejected: 1, synced: 0 });
    const mutation = await queue.getMutation(created.mutation.mutationId);
    expect(mutation).toMatchObject({ status: "rejected", lastError: "SLOT_FULL" });
    const order = await queue.getOrder(created.order.id);
    expect(order).toMatchObject({ syncState: "rejected", lastError: "SLOT_FULL" });
    expect(isServerConfirmed(order!)).toBe(false);

    const again = await flushPendingMutations({ queue, transport });
    expect(again.attempted).toBe(0);
    expect(transport.sent).toHaveLength(1);
  });
});
