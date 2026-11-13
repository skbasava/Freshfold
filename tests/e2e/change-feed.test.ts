import { describe, expect, it } from "vitest";
import type {
  ChangeFeedResponse,
  ChangeRecord,
} from "../../packages/contracts/src/changes";
import type { OrderDetail } from "../../packages/contracts/src/orders";
import {
  applyOrderSnapshot,
  pullChangeFeed,
  type ChangeFeedClient,
} from "../../frontend/src/sync/change-feed";
import {
  describeOrderSync,
  summarizeSyncState,
} from "../../frontend/src/orders/conflicts";
import { createMutationQueue } from "../../frontend/src/sync/mutation-queue";
import { createPendingMutation } from "../../frontend/src/sync/mutation-queue";
import { isServerConfirmed } from "../../frontend/src/sync/types";
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

function upsert(
  sequence: number,
  overrides: Partial<OrderDetail> = {},
): ChangeRecord {
  const order = serverOrder(overrides);
  return {
    sequence,
    hubId: order.hubId,
    orderId: order.id,
    version: order.version,
    operation: "upsert",
    changedAt: 1_000 + sequence,
    order,
  };
}

function tombstone(sequence: number, orderId = "order-1"): ChangeRecord {
  return {
    sequence,
    hubId: "hub-1",
    orderId,
    version: 2,
    operation: "delete",
    changedAt: 1_000 + sequence,
    order: null,
  };
}

function page(
  changes: ChangeRecord[],
  nextCursor: number,
  hasMore = false,
): ChangeFeedResponse {
  return { changes, nextCursor, hasMore };
}

function scriptedClient(
  pages: ChangeFeedResponse[],
): ChangeFeedClient & { calls: Array<{ since: number; limit: number }> } {
  const calls: Array<{ since: number; limit: number }> = [];
  return {
    calls,
    async fetchPage(since, limit) {
      calls.push({ since, limit });
      const next = pages.shift();
      if (!next) throw new Error("No scripted change-feed page");
      return next;
    },
  };
}

describe("change-feed pull", () => {
  it("applies pages in sequence and advances the cursor after each page", async () => {
    const { backend } = createMemoryBackend();
    const client = scriptedClient([
      page([upsert(1)], 1, true),
      page([upsert(2, { id: "order-2" })], 2, false),
    ]);

    const result = await pullChangeFeed({
      backend,
      client,
      hubId: "hub-1",
      limit: 1,
    });

    expect(result).toMatchObject({
      pages: 2,
      applied: 2,
      conflicts: 0,
      cursor: 2,
    });
    expect(client.calls).toEqual([
      { since: 0, limit: 1 },
      { since: 1, limit: 1 },
    ]);
    expect((await backend.getOrder("order-1"))?.syncState).toBe("synced");
    expect((await backend.getOrder("order-2"))?.syncState).toBe("synced");
    expect(await backend.getMeta("cursor")).toBe(2);
    expect(await backend.getMeta("hubId")).toBe("hub-1");
  });

  it("does not advance the cursor when a page cannot be applied", async () => {
    const { backend } = createMemoryBackend();
    const client = scriptedClient([
      page([upsert(1)], 1, true),
      page([upsert(2, { id: "order-2", hubId: "hub-2" })], 2, false),
    ]);

    await expect(
      pullChangeFeed({ backend, client, hubId: "hub-1", limit: 1 }),
    ).rejects.toThrow(/hub/i);

    expect(await backend.getMeta("cursor")).toBe(1);
    expect(await backend.getOrder("order-1")).toBeDefined();
    expect(await backend.getOrder("order-2")).toBeUndefined();
  });

  it("removes local rows when a tombstone is applied", async () => {
    const { backend } = createMemoryBackend();
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(makeLocalOrder({ syncState: "synced" }));
    });
    const client = scriptedClient([page([tombstone(1)], 1)]);

    await pullChangeFeed({ backend, client, hubId: "hub-1" });

    expect(await backend.getOrder("order-1")).toBeUndefined();
    expect(await backend.getMeta("cursor")).toBe(1);
  });

  it("marks a pending local order as conflict when the server version is newer", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(
        makeLocalOrder({
          syncState: "pending",
          version: 1,
          customerName: "Local Alice",
        }),
      );
    });
    const mutation = createPendingMutation({
      orderId: "order-1",
      intent: "reschedule",
      payload: { deliverySlotId: "slot-2" },
      baseVersion: 1,
      now: 100,
    });
    await backend.runTransaction(
      ["mutations"],
      "readwrite",
      async (tx) => {
        await tx.putMutation(mutation);
      },
    );

    const client = scriptedClient([
      page(
        [
          upsert(1, {
            version: 2,
            customerName: "Server Alice",
            deliverySlotId: "slot-3",
          }),
        ],
        1,
      ),
    ]);

    const result = await pullChangeFeed({
      backend,
      client,
      hubId: "hub-1",
    });

    expect(result.conflicts).toBe(1);
    const order = await queue.getOrder("order-1");
    expect(order).toMatchObject({
      syncState: "conflict",
      version: 1,
      customerName: "Local Alice",
    });
    expect(isServerConfirmed(order!)).toBe(false);
    const stored = await queue.getMutation(mutation.mutationId);
    expect(stored).toMatchObject({
      status: "conflict",
      serverOrder: { version: 2, customerName: "Server Alice" },
    });
    expect(await backend.getMeta("cursor")).toBe(1);
  });

  it("rejects another hub's changes without applying them", async () => {
    const { backend } = createMemoryBackend();
    await backend.setMeta("hubId", "hub-1");
    await backend.setMeta("cursor", 7);
    const client = scriptedClient([
      page([upsert(8, { hubId: "hub-2" })], 8),
    ]);

    await expect(
      pullChangeFeed({ backend, client, hubId: "hub-1" }),
    ).rejects.toThrow(/hub/i);

    expect(await backend.getMeta("cursor")).toBe(7);
    expect(await backend.getOrder("order-1")).toBeUndefined();
  });
});

describe("snapshot recovery", () => {
  it("rebuilds orders and resets the cursor only after the snapshot is applied", async () => {
    const { backend } = createMemoryBackend();
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(
        makeLocalOrder({ id: "stale-order", syncState: "synced" }),
      );
    });
    await backend.setMeta("cursor", 99);
    await backend.setMeta("hubId", "hub-1");

    const result = await applyOrderSnapshot({
      backend,
      hubId: "hub-1",
      cursor: 10,
      orders: [serverOrder({ id: "order-1", version: 3 })],
      now: 5_000,
    });

    expect(result).toMatchObject({ applied: 1, conflicts: 0, cursor: 10 });
    expect(await backend.getOrder("stale-order")).toBeUndefined();
    expect(await backend.getOrder("order-1")).toMatchObject({
      syncState: "synced",
      version: 3,
    });
    expect(await backend.getMeta("cursor")).toBe(10);
    expect(await backend.getMeta("hubId")).toBe("hub-1");
  });

  it("keeps a newer optimistic order and marks its pending mutation as conflict", async () => {
    const { backend } = createMemoryBackend();
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(
        makeLocalOrder({
          syncState: "pending",
          version: 1,
          deliverySlotId: "slot-local",
        }),
      );
    });
    const mutation = createPendingMutation({
      orderId: "order-1",
      intent: "reschedule",
      payload: { deliverySlotId: "slot-local" },
      baseVersion: 1,
      now: 100,
    });
    await backend.runTransaction(["mutations"], "readwrite", async (tx) => {
      await tx.putMutation(mutation);
    });

    const result = await applyOrderSnapshot({
      backend,
      hubId: "hub-1",
      cursor: 0,
      orders: [serverOrder({ version: 2, deliverySlotId: "slot-server" })],
      now: 5_000,
    });

    expect(result.conflicts).toBe(1);
    expect(await backend.getOrder("order-1")).toMatchObject({
      syncState: "conflict",
      deliverySlotId: "slot-local",
    });
    expect(await backend.getMutation(mutation.mutationId)).toMatchObject({
      status: "conflict",
      serverOrder: { version: 2, deliverySlotId: "slot-server" },
    });
  });

  it("does not reset the cursor when snapshot hub isolation fails", async () => {
    const { backend } = createMemoryBackend();
    await backend.setMeta("cursor", 42);

    await expect(
      applyOrderSnapshot({
        backend,
        hubId: "hub-1",
        cursor: 0,
        orders: [serverOrder({ hubId: "hub-2" })],
      }),
    ).rejects.toThrow(/hub/i);

    expect(await backend.getMeta("cursor")).toBe(42);
  });
});

describe("conflict UI presentation", () => {
  it("presents pending orders as provisional and never confirmed", () => {
    const view = describeOrderSync(makeLocalOrder({ syncState: "pending" }));

    expect(view).toMatchObject({
      state: "pending",
      provisional: true,
      serverConfirmed: false,
      tone: "info",
      requiresReview: false,
    });
    expect(view.label).toMatch(/pending/i);
  });

  it("presents rejected orders with the reason and a review action", () => {
    const view = describeOrderSync(
      makeLocalOrder({
        syncState: "rejected",
        lastError: "SLOT_FULL",
      }),
    );

    expect(view).toMatchObject({
      state: "rejected",
      tone: "danger",
      requiresReview: true,
      message: "SLOT_FULL",
      serverConfirmed: false,
    });
  });

  it("presents conflicts with the newer server version for review", () => {
    const mutation = createPendingMutation({
      orderId: "order-1",
      intent: "reschedule",
      payload: { deliverySlotId: "slot-2" },
      baseVersion: 1,
      now: 100,
    });
    const view = describeOrderSync(
      makeLocalOrder({ syncState: "conflict", lastError: "VERSION_CONFLICT" }),
      [
        {
          ...mutation,
          status: "conflict",
          serverOrder: makeLocalOrder({ version: 4, syncState: "conflict" }),
        },
      ],
    );

    expect(view).toMatchObject({
      state: "conflict",
      tone: "warning",
      requiresReview: true,
      serverVersion: 4,
      serverConfirmed: false,
    });
    expect(view.message).toMatch(/VERSION_CONFLICT|version/i);
  });

  it("summarizes unsynced work for the workspace", () => {
    const summary = summarizeSyncState([
      makeLocalOrder({ id: "a", syncState: "synced" }),
      makeLocalOrder({ id: "b", syncState: "pending" }),
      makeLocalOrder({ id: "c", syncState: "conflict" }),
      makeLocalOrder({ id: "d", syncState: "rejected" }),
    ]);

    expect(summary).toEqual({
      total: 4,
      synced: 1,
      pending: 1,
      conflict: 1,
      rejected: 1,
      unsynced: 3,
    });
  });
});
