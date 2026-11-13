import type {
  OrderDetail,
  OrderSummary,
  SessionResponse,
} from "@laundry/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorageBackend } from "../db/memory";
import { getDatabase, resetDatabase } from "../database/db";
import { createMockApi } from "../mocks/api";
import { createMutationQueue, createPendingMutation } from "../sync/mutation-queue";
import type { LocalOrder } from "../sync/types";
import {
  createAppApi,
  describeGatewayError,
  readApiConfig,
  type ApiConfig,
} from "./adapters";
import {
  GatewayApiError,
  type FetchLike,
} from "./client";

const session: SessionResponse = {
  user: {
    id: "user-manager",
    email: "manager@example.com",
    displayName: "Maya Manager",
  },
  hub: { id: "hub-1", tenantId: "tenant-1" },
  role: "manager",
};

const summary: OrderSummary = {
  id: "order-1",
  hubId: "hub-1",
  customerId: "cust-1",
  customerName: "Alice",
  customerPhone: "+919000000001",
  status: "processing",
  serviceType: "Wash and fold",
  deliverySlotId: "slot-1",
  deliveryAt: Date.parse("2026-11-11T16:00:00+05:30"),
  version: 2,
  createdAt: Date.parse("2026-11-11T09:00:00+05:30"),
  updatedAt: Date.parse("2026-11-11T10:00:00+05:30"),
  cancelledAt: null,
  holdComment: null,
};

const detail: OrderDetail = {
  ...summary,
  customer: {
    id: "cust-1",
    hubId: "hub-1",
    name: "Alice",
    phone: "+919000000001",
    notes: null,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  },
  items: [
    {
      id: "item-1",
      hubId: "hub-1",
      orderId: "order-1",
      description: "Shirt",
      quantity: 2,
      serviceType: "Wash and fold",
      createdAt: summary.createdAt,
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function liveFetch(): {
  fetchImpl: FetchLike;
  calls: Array<{ input: string; init?: Record<string, unknown> }>;
} {
  const calls: Array<{ input: string; init?: Record<string, unknown> }> = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ input, init: init as Record<string, unknown> });
    const path = String(input);

    if (path === "/api/me") {
      return jsonResponse(session);
    }
    if (path.startsWith("/api/orders?") || path === "/api/orders") {
      return jsonResponse({ items: [summary], nextCursor: null });
    }
    if (path === "/api/orders/order-1") {
      return jsonResponse(detail);
    }
    if (path.startsWith("/api/customers?") || path === "/api/customers") {
      return jsonResponse({ items: [detail.customer], nextCursor: null });
    }
    if (path.startsWith("/api/delivery-slots?") || path === "/api/delivery-slots") {
      return jsonResponse({ items: [] });
    }
    if (path === "/api/customers/cust-1") {
      return jsonResponse(detail.customer);
    }
    if (path === "/api/orders/apply-change") {
      return jsonResponse({ order: detail, replayed: false, customerCreated: false });
    }
    return jsonResponse({ error: "not_found" }, 404);
  };
  return { fetchImpl, calls };
}

function liveConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    mode: "live",
    baseUrl: "",
    timeoutMs: 1_000,
    demoFallbacks: false,
    requireAuth: true,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDatabase(getDatabase());
});

describe("API mode configuration", () => {
  it("defaults to the live adapter and opts into mock explicitly", () => {
    expect(readApiConfig({})).toMatchObject({
      mode: "live",
      demoFallbacks: false,
      requireAuth: false,
    });
    expect(readApiConfig({ VITE_API_MODE: "mock" })).toMatchObject({
      mode: "mock",
    });
    expect(readApiConfig({ VITE_API_MODE: "MOCK" }).mode).toBe("mock");
  });

  it("keeps mock and live adapters separate", async () => {
    const mock = createAppApi(
      readApiConfig({ VITE_API_MODE: "mock" }),
    );
    const { fetchImpl } = liveFetch();
    const live = createAppApi(liveConfig(), {
      fetchImpl,
      backend: createMemoryStorageBackend(),
    });

    expect(mock.mode).toBe("mock");
    expect(mock.capabilities).toMatchObject({
      roleSwitch: true,
      deliverySlots: "available",
    });
    expect((await mock.getSession()).user.name).toBe("Riya Sharma");

    expect(live.mode).toBe("live");
    expect(live.capabilities).toMatchObject({
      roleSwitch: false,
      deliverySlots: "unavailable",
      customerWrite: "unavailable",
      customerOrderHistory: "order-scan-fallback",
    });
    expect((await live.getSession()).user.name).toBe("Maya Manager");
  });

  it("requires authentication in mock mode only when configured", async () => {
    const api = createMockApi({
      latencyMs: 0,
      syncIssues: false,
      authRequired: true,
    });

    await expect(api.getSession()).rejects.toMatchObject({ status: 401 });
    const signedIn = await api.login({
      email: "desk@example.com",
      password: "demo",
    });
    expect(signedIn.user.role).toBe("front_desk");
    expect((await api.getSession()).user.name).toBe("Riya Sharma");

    await api.logout();
    await expect(api.getSession()).rejects.toMatchObject({ status: 401 });
  });
});

describe("live adapter reads", () => {
  it("uses the gateway session, order and customer endpoints", async () => {
    const { fetchImpl, calls } = liveFetch();
    const api = createAppApi(liveConfig(), {
      fetchImpl,
      backend: createMemoryStorageBackend(),
    });

    const signedIn = await api.getSession();
    const orders = await api.listOrders({ search: "alice" });
    const order = await api.getOrder("order-1");
    const customer = await api.getCustomer("cust-1");

    expect(signedIn.user.name).toBe("Maya Manager");
    expect(orders.items).toHaveLength(1);
    expect(orders.items[0]).toMatchObject({
      id: "order-1",
      customerName: "Alice",
      totalItems: 2,
    });
    expect(order?.customer.name).toBe("Alice");
    expect(order?.deliverySlot?.label).toContain("4:00");
    expect(customer?.customer.name).toBe("Alice");
    expect(customer?.orders.map((entry) => entry.id)).toEqual(["order-1"]);
    expect(calls.some((call) => call.input === "/api/me")).toBe(true);
    expect(calls.some((call) => call.input === "/api/orders/order-1")).toBe(
      true,
    );
  });

  it("marks delivery slots and customer order history as isolated fallbacks", async () => {
    const { fetchImpl } = liveFetch();
    const unavailable = createAppApi(liveConfig(), {
      fetchImpl,
      backend: createMemoryStorageBackend(),
    });
    const fallback = createAppApi(liveConfig({ demoFallbacks: true }), {
      fetchImpl,
      backend: createMemoryStorageBackend(),
    });

    expect((await unavailable.getCreateOrderOptions()).slots).toEqual([]);
    expect((await fallback.getCreateOrderOptions()).slots.length).toBeGreaterThan(
      0,
    );
    expect(fallback.capabilities.deliverySlots).toBe("demo-fallback");
  });
});

describe("live adapter customer creation", () => {
  it("sends customer name and phone and surfaces customerCreated", async () => {
    let applyBody: Record<string, unknown> | null = null;
    const newCustomer = {
      ...detail.customer,
      id: "cust-new",
      name: "Asha Verma",
      phone: "+919876543210",
    };
    const fetchImpl: FetchLike = async (input, init) => {
      const path = String(input);
      if (path === "/api/me") {
        return jsonResponse(session);
      }
      if (path.startsWith("/api/customers")) {
        return jsonResponse({ items: [detail.customer], nextCursor: null });
      }
      if (path.startsWith("/api/orders?") || path === "/api/orders") {
        return jsonResponse({ items: [], nextCursor: null });
      }
      if (path === "/api/orders/apply-change") {
        applyBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const orderId = String(applyBody.orderId);
        return jsonResponse({
          order: {
            ...detail,
            id: orderId,
            customerId: newCustomer.id,
            customerName: newCustomer.name,
            customerPhone: newCustomer.phone,
            customer: newCustomer,
          },
          replayed: false,
          customerCreated: true,
        });
      }
      if (path.startsWith("/api/orders/")) {
        const orderId = path.split("/").at(-1) as string;
        return jsonResponse({
          ...detail,
          id: orderId,
          customerId: newCustomer.id,
          customerName: newCustomer.name,
          customerPhone: newCustomer.phone,
          customer: newCustomer,
        });
      }
      return jsonResponse({ error: "not_found" }, 404);
    };

    const api = createAppApi(liveConfig({ demoFallbacks: true }), {
      fetchImpl,
      backend: createMemoryStorageBackend(),
      getAccessToken: () => "access-token-1",
    });
    const options = await api.getCreateOrderOptions();
    const slot = options.slots.find((entry) => entry.status === "open");
    expect(slot).toBeDefined();

    const created = await api.createOrder({
      customerName: "Asha Verma",
      customerPhone: "98765 43210",
      serviceType: "Wash and fold",
      deliverySlotId: slot!.id,
      items: [{ description: "Shirt", quantity: 1 }],
    });

    const sent = applyBody as {
      payload?: Record<string, unknown>;
    } | null;
    expect(sent?.payload).toMatchObject({
      customerName: "Asha Verma",
      customerPhone: "+919876543210",
    });
    expect(sent?.payload?.customerId).toBeUndefined();
    expect(created.customerCreated).toBe(true);
  });
});

describe("live adapter offline queue", () => {
  it("flushes a pending mutation through the gateway with bearer auth", async () => {
    const { fetchImpl, calls } = liveFetch();
    const backend = createMemoryStorageBackend();
    const queue = createMutationQueue(backend);
    const local: LocalOrder = {
      id: "order-1",
      hubId: "hub-1",
      customerId: "cust-1",
      customerName: "Alice",
      customerPhone: "+919000000001",
      status: "confirmed",
      serviceType: "Wash and fold",
      deliverySlotId: "slot-1",
      deliveryAt: summary.deliveryAt,
      version: 1,
      holdComment: null,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      syncState: "pending",
    };
    await queue.enqueueOptimistic(
      local,
      createPendingMutation({
        orderId: "order-1",
        intent: "markProcessing",
        payload: {},
        baseVersion: 1,
        now: 1_000,
      }),
    );

    const api = createAppApi(liveConfig(), {
      fetchImpl,
      backend,
      getAccessToken: () => "access-token-1",
    });
    await api.syncPendingMutations();

    const applyChange = calls.find(
      (call) => call.input === "/api/orders/apply-change",
    );
    expect(applyChange?.init).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer access-token-1",
      }),
    });
    expect(await api.getPendingCount()).toBe(0);
    expect(await backend.getOrder("order-1")).toMatchObject({
      syncState: "synced",
      status: "processing",
      version: 2,
    });
  });

  it("caches remote orders into the storage backend on fetch", async () => {
    const { fetchImpl } = liveFetch();
    const backend = createMemoryStorageBackend();
    const api = createAppApi(liveConfig(), {
      fetchImpl,
      backend,
      getAccessToken: () => "access-token-1",
    });

    expect(await backend.listOrders()).toHaveLength(0);

    const result = await api.listOrders();
    expect(result.items.length).toBeGreaterThan(0);

    const cached = await backend.listOrders();
    expect(cached.length).toBeGreaterThan(0);
    expect(cached[0]).toMatchObject({
      id: "order-1",
      syncState: "synced",
    });
  });

  it("reads orders from the Dexie local replica after sync from remote D1", async () => {
    const { fetchImpl } = liveFetch();
    const backend = createMemoryStorageBackend();
    const api = createAppApi(liveConfig(), {
      fetchImpl,
      backend,
      getAccessToken: () => "access-token-1",
    });

    const result = await api.listOrders();
    expect(result.items.length).toBeGreaterThan(0);

    const dexieDb = getDatabase();
    const dexieOrders = await dexieDb.orders.toArray();
    expect(dexieOrders.length).toBeGreaterThan(0);
    expect(dexieOrders.some((o) => o.id === "order-1")).toBe(true);
  });

  it("does not call the Gateway if orders are already available in IndexedDB", async () => {
    let gatewayCalled = false;
    const fetchImpl: FetchLike = async (input) => {
      const path = String(input);
      if (path.startsWith("/api/orders")) {
        gatewayCalled = true;
      }
      return jsonResponse({ items: [], nextCursor: null });
    };

    const backend = createMemoryStorageBackend();
    await backend.runTransaction(["orders"], "readwrite", (tx) =>
      tx.putOrder({
        id: "order-local-only",
        hubId: "hub-1",
        customerId: "cust-1",
        customerName: "Local Customer",
        customerPhone: "+919000000001",
        status: "confirmed",
        serviceType: "Wash and fold",
        deliverySlotId: "slot-1",
        deliveryAt: 1700000000000,
        version: 1,
        holdComment: null,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        syncState: "synced",
      }),
    );

    const api = createAppApi(liveConfig(), {
      fetchImpl,
      backend,
      getAccessToken: () => "access-token-1",
    });

    const result = await api.listOrders();
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.id).toBe("order-local-only");
    expect(gatewayCalled).toBe(false);
  });

  it("preserves a live version conflict and exposes the canonical order", async () => {
    const fetchImpl: FetchLike = async (input, init) => {
      const path = String(input);
      if (path === "/api/me") {
        return jsonResponse(session);
      }
      if (path === "/api/orders/order-1" && init?.method === "GET") {
        return jsonResponse(detail);
      }
      if (path === "/api/orders/apply-change") {
        return jsonResponse(
          {
            error: "VERSION_CONFLICT",
            order: { ...detail, version: 3, status: "hold" },
          },
          409,
        );
      }
      return jsonResponse({ error: "not_found" }, 404);
    };
    const backend = createMemoryStorageBackend();
    const api = createAppApi(liveConfig(), {
      fetchImpl,
      backend,
      getAccessToken: () => "access-token-1",
    });

    await expect(
      api.applyOrderIntent("order-1", "markProcessing", {}, 2),
    ).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
      currentOrder: { id: "order-1", syncState: "conflict" },
    });

    const mutations = await createMutationQueue(backend).listMutations(
      "order-1",
    );
    expect(mutations[0]?.status).toBe("conflict");
    expect((await backend.getOrder("order-1"))?.syncState).toBe("conflict");
  });

  it("keeps an offline update provisional and preserves its mutation id", async () => {
    const { fetchImpl } = liveFetch();
    const backend = createMemoryStorageBackend();
    const api = createAppApi(liveConfig(), {
      fetchImpl,
      backend,
      getAccessToken: () => "access-token-1",
    });

    const updated = await api.applyOrderIntent(
      "order-1",
      "markProcessing",
      {},
      2,
      { online: false },
    );

    expect(updated.syncState).toBe("pending");
    expect(updated.status).toBe("processing");
    const mutations = await createMutationQueue(backend).listMutations(
      "order-1",
    );
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.mutationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("live adapter authenticated offline sync", () => {
  function pendingOrder(): LocalOrder {
    return {
      id: "order-1",
      hubId: "hub-1",
      customerId: "cust-1",
      customerName: "Alice",
      customerPhone: "+919000000001",
      status: "confirmed",
      serviceType: "Wash and fold",
      deliverySlotId: "slot-1",
      deliveryAt: summary.deliveryAt,
      version: 1,
      holdComment: null,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      syncState: "pending",
    };
  }

  async function enqueuePending(backend: ReturnType<typeof createMemoryStorageBackend>) {
    const queue = createMutationQueue(backend);
    await queue.enqueueOptimistic(
      pendingOrder(),
      createPendingMutation({
        orderId: "order-1",
        intent: "markProcessing",
        payload: {},
        baseVersion: 1,
        now: 1_000,
      }),
    );
  }

  it("does not flush pending mutations without an authenticated session", async () => {
    const { fetchImpl, calls } = liveFetch();
    const backend = createMemoryStorageBackend();
    await enqueuePending(backend);
    const api = createAppApi(liveConfig(), {
      fetchImpl,
      backend,
      getAccessToken: () => null,
    });

    await api.syncPendingMutations();

    expect(calls.some((call) => call.input === "/api/orders/apply-change")).toBe(
      false,
    );
    expect(await api.getPendingCount()).toBe(1);
  });

  it("keeps each employee's pending mutations isolated across account switches", async () => {
    const { fetchImpl } = liveFetch();
    const scopes = new Map<string, ReturnType<typeof createMemoryStorageBackend>>();
    const backendFor = (key: string | null) => {
      if (!key) {
        return createMemoryStorageBackend();
      }
      const existing = scopes.get(key);
      if (existing) {
        return existing;
      }
      const created = createMemoryStorageBackend();
      scopes.set(key, created);
      return created;
    };
    const api = createAppApi(liveConfig(), {
      fetchImpl,
      backendFactory: backendFor,
      getAccessToken: () => null,
    });

    await api.setAccountScope?.("employee-a:tenant-1:hub-1");
    await enqueuePending(backendFor("employee-a:tenant-1:hub-1"));
    expect(await api.getPendingCount()).toBe(1);

    await api.setAccountScope?.("employee-b:tenant-1:hub-1");
    expect(await api.getPendingCount()).toBe(0);

    await api.setAccountScope?.("employee-a:tenant-1:hub-1");
    expect(await api.getPendingCount()).toBe(1);

    await api.setAccountScope?.(null);
    expect(await api.getPendingCount()).toBe(0);
  });
});

describe("gateway error messages", () => {
  it("explains when the local gateway is unreachable", () => {
    expect(
      describeGatewayError(
        new GatewayApiError({ status: 0, code: "NETWORK_ERROR" }),
      ),
    ).toBe(
      "Cannot reach the local Gateway. Start the backend with `pnpm dev:live` and try again.",
    );
  });

  it("explains when a Google account lacks FreshFold role claims", () => {
    expect(
      describeGatewayError(
        new GatewayApiError({ status: 403, code: "membership_missing" }),
      ),
    ).toBe(
      "Your Google account is not enabled for a FreshFold hub yet. Ask your hub manager to assign your role and hub.",
    );
  });
});
