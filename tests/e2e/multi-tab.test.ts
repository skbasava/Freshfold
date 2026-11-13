import { describe, expect, it } from "vitest";
import type { ApplyChangeInput } from "../../packages/contracts/src/mutations";
import type { OrderDetail } from "../../packages/contracts/src/orders";
import { createMutationQueue, createPendingMutation } from "../../frontend/src/sync/mutation-queue";
import {
  createInMemoryLockManager,
  createLockCoordinator,
} from "../../frontend/src/sync/locks";
import {
  createSyncBroadcast,
  type BroadcastChannelLike,
  type SyncEvent,
} from "../../frontend/src/sync/broadcast";
import {
  createPendingMutationWarning,
  rebuildFromSnapshot,
  requestStoragePersistence,
} from "../../frontend/src/sync/recovery";
import {
  flushPendingMutations,
  type MutationTransport,
  type MutationTransportResult,
} from "../../frontend/src/sync/submit";
import {
  createMemoryBackend,
  makeLocalOrder,
} from "../helpers/memory-storage";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

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

function transportFor(
  handler: (input: ApplyChangeInput) => Promise<MutationTransportResult>,
): MutationTransport {
  return { send: handler };
}

describe("multi-tab coordination", () => {
  it("lets only one tab become the change-feed leader", async () => {
    const manager = createInMemoryLockManager();
    const firstTab = createLockCoordinator({ manager, hubId: "hub-1" });
    const secondTab = createLockCoordinator({ manager, hubId: "hub-1" });
    const entered = deferred();
    const release = deferred();

    const first = firstTab.runAsFeedLeader(async () => {
      entered.resolve();
      await release.promise;
      return "first";
    });
    await entered.promise;

    const second = await secondTab.runAsFeedLeader(async () => "second");
    expect(second).toEqual({ ran: false });

    release.resolve();
    expect(await first).toEqual({ ran: true, result: "first" });
  });

  it("serializes submissions for the same order", async () => {
    const { backend, stats } = createMemoryBackend();
    const manager = createInMemoryLockManager();
    const locks = createLockCoordinator({ manager, hubId: "hub-1" });
    const queue = createMutationQueue(backend);
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(makeLocalOrder({ syncState: "synced" }));
    });
    const mutation = createPendingMutation({
      orderId: "order-1",
      intent: "markProcessing",
      payload: {},
      baseVersion: 1,
      now: 100,
    });
    await backend.runTransaction(["mutations"], "readwrite", async (tx) => {
      await tx.putMutation(mutation);
    });

    let active = 0;
    let maxActive = 0;
    let sends = 0;
    const entered = deferred();
    const release = deferred();
    const transport = transportFor(async () => {
      sends += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      entered.resolve();
      await release.promise;
      active -= 1;
      return {
        kind: "accepted",
        replayed: false,
        order: serverOrder({ status: "processing", version: 2 }),
      };
    });

    const first = flushPendingMutations({
      queue,
      transport,
      withOrderLock: (orderId, fn) => locks.withOrderLock(orderId, fn),
    });
    await entered.promise;
    const second = flushPendingMutations({
      queue,
      transport,
      withOrderLock: (orderId, fn) => locks.withOrderLock(orderId, fn),
    });

    release.resolve();
    const [firstSummary, secondSummary] = await Promise.all([first, second]);

    expect(maxActive).toBe(1);
    expect(sends).toBe(1);
    expect(firstSummary.synced).toBe(1);
    expect(secondSummary.attempted).toBe(0);
    expect(stats.transactions).toBeGreaterThan(0);
  });

  it("keeps pending mutations across a reload of the same storage", async () => {
    const { backend } = createMemoryBackend();
    const beforeReload = createMutationQueue(backend);
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(makeLocalOrder({ syncState: "synced" }));
    });
    const mutation = createPendingMutation({
      orderId: "order-1",
      intent: "markProcessing",
      payload: {},
      baseVersion: 1,
      now: 100,
    });
    await backend.runTransaction(["orders", "mutations"], "readwrite", async (tx) => {
      await tx.putMutation(mutation);
      const order = await tx.getOrder("order-1");
      await tx.putOrder({ ...order!, syncState: "pending" });
    });

    const afterReload = createMutationQueue(backend);
    expect(await afterReload.listMutations("order-1")).toHaveLength(1);
    expect((await afterReload.getMutation(mutation.mutationId))?.status).toBe(
      "pending",
    );

    const summary = await flushPendingMutations({
      queue: afterReload,
      transport: transportFor(async () => ({
        kind: "accepted",
        replayed: false,
        order: serverOrder({ status: "processing", version: 2 }),
      })),
    });
    expect(summary.synced).toBe(1);
  });
});

describe("broadcast coordination", () => {
  function createBus() {
    const channels: Array<BroadcastChannelLike & { name: string }> = [];
    const factory = (name: string): BroadcastChannelLike => {
      const channel: BroadcastChannelLike & { name: string } = {
        name,
        onmessage: null,
        postMessage(message) {
          for (const peer of channels) {
            if (peer !== channel && peer.name === name) {
              peer.onmessage?.({ data: message });
            }
          }
        },
        close() {
          const index = channels.indexOf(channel);
          if (index >= 0) channels.splice(index, 1);
        },
      };
      channels.push(channel);
      return channel;
    };
    return { factory };
  }

  it("does not leak sync events across hubs", () => {
    const bus = createBus();
    const hubOneSender = createSyncBroadcast({
      hubId: "hub-1",
      channelFactory: bus.factory,
    });
    const hubOneReceiver = createSyncBroadcast({
      hubId: "hub-1",
      channelFactory: bus.factory,
    });
    const hubTwo = createSyncBroadcast({
      hubId: "hub-2",
      channelFactory: bus.factory,
    });
    const first: SyncEvent[] = [];
    const second: SyncEvent[] = [];
    hubOneReceiver.subscribe((event) => first.push(event));
    hubTwo.subscribe((event) => second.push(event));

    hubOneSender.post({ type: "cursor-advanced", hubId: "hub-1", cursor: 5 });

    expect(first).toEqual([
      { type: "cursor-advanced", hubId: "hub-1", cursor: 5 },
    ]);
    expect(second).toEqual([]);
    expect(() =>
      hubOneSender.post({ type: "cursor-advanced", hubId: "hub-2", cursor: 9 }),
    ).toThrow(/hub/i);

    hubOneSender.close();
    hubOneReceiver.close();
    hubTwo.close();
  });
});

describe("storage recovery", () => {
  it("rebuilds a cleared replica from a snapshot and warns about lost mutations", async () => {
    const storage = createMemoryBackend();
    const backend = storage.backend;
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(makeLocalOrder({ syncState: "pending" }));
    });
    storage.clear();

    const result = await rebuildFromSnapshot({
      backend,
      hubId: "hub-1",
      cursor: 0,
      snapshot: [serverOrder({ version: 4 })],
      lostMutationCount: 2,
      now: 9_000,
    });

    expect(result).toMatchObject({ applied: 1, cursor: 0, lostMutations: 2 });
    expect(result.warning).toMatch(/2 unsynced.*may be lost/i);
    expect(await backend.getOrder("order-1")).toMatchObject({
      syncState: "synced",
      version: 4,
    });
    expect(await backend.getMeta("cursor")).toBe(0);
  });

  it("requests persistent browser storage and tolerates refusal", async () => {
    let calls = 0;
    const granted = await requestStoragePersistence({
      async persist() {
        calls += 1;
        return true;
      },
    });
    const denied = await requestStoragePersistence({
      async persist() {
        return false;
      },
    });
    const unavailable = await requestStoragePersistence(null);

    expect(granted).toBe(true);
    expect(denied).toBe(false);
    expect(unavailable).toBe(false);
    expect(calls).toBe(1);
  });

  it("warns before unload while unsynced mutations exist", async () => {
    const { backend } = createMemoryBackend();
    const queue = createMutationQueue(backend);
    await backend.runTransaction(["orders"], "readwrite", async (tx) => {
      await tx.putOrder(makeLocalOrder({ syncState: "pending" }));
    });
    const mutation = createPendingMutation({
      orderId: "order-1",
      intent: "markProcessing",
      payload: {},
      baseVersion: 1,
      now: 100,
    });
    await backend.runTransaction(["mutations"], "readwrite", async (tx) => {
      await tx.putMutation(mutation);
    });

    let listener: ((event: Event) => void) | null = null;
    const target = {
      addEventListener(_type: string, next: (event: Event) => void) {
        listener = next;
      },
      removeEventListener() {
        listener = null;
      },
    } as unknown as Pick<
      EventTarget,
      "addEventListener" | "removeEventListener"
    >;
    const warning = createPendingMutationWarning({
      backend,
      target,
      now: 5_000,
    });

    const message = await warning.refresh();
    expect(message).toMatch(/1 unsynced/i);

    let prevented = false;
    const event = {
      preventDefault() {
        prevented = true;
      },
      returnValue: undefined as unknown,
    };
    listener!(event as unknown as Event);
    expect(prevented).toBe(true);
    expect(event.returnValue).toBe(message);

    await queue.markSynced(mutation.mutationId);
    expect(await warning.refresh()).toBeNull();
    warning.dispose();
  });
});
