import type {
  ApplyChangeInput,
  OrderDetail,
  SessionResponse,
} from "@laundry/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  AUTH_FAILURE_EVENT,
  GatewayApiError,
  createGatewayClient,
  type AuthFailureDetail,
  type FetchLike,
} from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const session: SessionResponse = {
  user: {
    id: "user-desk",
    email: "desk@example.com",
    displayName: "Desk User",
  },
  hub: { id: "hub-1", tenantId: "tenant-1" },
  role: "front_desk",
};

const order: OrderDetail = {
  id: "order-1",
  hubId: "hub-1",
  customerId: "cust-1",
  customerName: "Alice",
  customerPhone: "+919000000001",
  status: "processing",
  serviceType: "Wash and fold",
  deliverySlotId: "slot-1",
  deliveryAt: 1_000,
  version: 2,
  createdAt: 900,
  updatedAt: 1_000,
  cancelledAt: null,
  holdComment: null,
  customer: {
    id: "cust-1",
    hubId: "hub-1",
    name: "Alice",
    phone: "+919000000001",
    notes: null,
    createdAt: 900,
    updatedAt: 900,
  },
  items: [],
};

const markProcessing: ApplyChangeInput = {
  orderId: "order-1",
  mutationId: "mutation-1",
  intent: "markProcessing",
  payload: {},
  baseVersion: 1,
};

function fetchCalls(fetchImpl: ReturnType<typeof vi.fn>) {
  return fetchImpl.mock.calls.map(([input, init]) => ({
    input: String(input),
    init: init as {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      credentials?: string;
    },
  }));
}

describe("gateway client bearer authentication", () => {
  it("sends an Authorization bearer header without cookies or CSRF", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ items: [], nextCursor: null }),
    );
    const client = createGatewayClient({
      fetchImpl,
      getAccessToken: () => "access-token-1",
      requestIdFactory: () => "request-1",
    });

    await client.listOrders();

    const [call] = fetchCalls(fetchImpl);
    expect(call?.init.headers).toMatchObject({
      authorization: "Bearer access-token-1",
      "x-request-id": "request-1",
    });
    expect(call?.init.headers).not.toHaveProperty("x-csrf-token");
    expect(call?.init.credentials).toBe("omit");
  });

  it("resolves the authenticated session from /api/me", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(session));
    const client = createGatewayClient({
      fetchImpl,
      getAccessToken: () => "access-token-1",
    });

    const restored = await client.getSession();

    expect(restored.user.id).toBe("user-desk");
    expect(fetchCalls(fetchImpl)[0]?.input).toBe("/api/me");
  });

  it("keeps the session on a business permission 403", async () => {
    const listener = vi.fn();
    const cleared: Array<string | null> = [];
    window.addEventListener(AUTH_FAILURE_EVENT, listener);
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ error: "forbidden" }, 403),
    );
    const client = createGatewayClient({
      fetchImpl,
      getAccessToken: () => "access-token-1",
      setAccessToken: (token) => cleared.push(token),
    });

    await expect(client.listOrders()).rejects.toMatchObject({ status: 403 });

    expect(listener).not.toHaveBeenCalled();
    expect(cleared).not.toContain(null);
    window.removeEventListener(AUTH_FAILURE_EVENT, listener);
  });

  it("announces revoked access and clears the bearer after a 403", async () => {
    const cleared: Array<string | null> = [];
    const listener = vi.fn<(event: CustomEvent<AuthFailureDetail>) => void>();
    window.addEventListener(
      AUTH_FAILURE_EVENT,
      listener as unknown as EventListener,
    );
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(
        { error: "membership_inactive", code: "membership_inactive" },
        403,
      ),
    );
    const client = createGatewayClient({
      fetchImpl,
      getAccessToken: () => "access-token-1",
      setAccessToken: (token) => cleared.push(token),
    });

    await expect(client.listOrders()).rejects.toMatchObject({ status: 403 });

    const detail = listener.mock.calls[0]?.[0]?.detail;
    expect(detail).toMatchObject({ status: 403, code: "membership_inactive" });
    expect(cleared).toContain(null);
    window.removeEventListener(
      AUTH_FAILURE_EVENT,
      listener as unknown as EventListener,
    );
  });
});

describe("gateway client read queries", () => {
  it("fetches delivery slots with optional date query", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({
        items: [
          {
            id: "slot-1",
            hubId: "hub-1",
            slotKey: "2026-11-13_09:00",
            localDate: "2026-11-13",
            localStart: "09:00",
            startsAt: 1000,
            endsAt: 2000,
            capacity: 10,
            active: 1,
            createdAt: 500,
          },
        ],
      }),
    );
    const client = createGatewayClient({ fetchImpl });
    const response = await client.listDeliverySlots({ date: "2026-11-13" });

    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.id).toBe("slot-1");
    const [call] = fetchCalls(fetchImpl);
    expect(call?.input).toBe("/api/delivery-slots?date=2026-11-13");
  });

  it("builds change-feed and order-event queries", async () => {
    const fetchImpl = vi.fn<FetchLike>(async (input) => {
      if (String(input).startsWith("/api/changes")) {
        return jsonResponse({ changes: [], nextCursor: 5, hasMore: false });
      }
      return jsonResponse({ items: [] });
    });
    const client = createGatewayClient({ fetchImpl });

    await client.getChanges({ since: 5, limit: 10 });
    await client.getOrderEvents("order-1", { limit: 20 });

    const calls = fetchCalls(fetchImpl);
    expect(calls[0]?.input).toBe("/api/changes?since=5&limit=10");
    expect(calls[1]?.input).toBe("/api/orders/order-1/events?limit=20");
  });
});

describe("gateway client error mapping", () => {
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [422, "SLOT_FULL"],
    [429, "rate_limited"],
    [500, "internal_error"],
  ])("maps HTTP %i to a typed error", async (status, code) => {
    const client = createGatewayClient({
      fetchImpl: async () =>
        jsonResponse({ error: code, requestId: "server-request" }, status),
    });

    await expect(client.getOrder("order-1")).rejects.toMatchObject({
      name: "GatewayApiError",
      status,
      code,
      requestId: "server-request",
    });
  });

  it("preserves the canonical order on a version conflict", async () => {
    const client = createGatewayClient({
      fetchImpl: async () =>
        jsonResponse({ error: "VERSION_CONFLICT", order }, 409),
      getAccessToken: () => "access-token-1",
    });

    await expect(client.applyChange(markProcessing)).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
      currentOrder: { id: "order-1", version: 2 },
    });
  });

  it("classifies rate limits and server failures as retryable", async () => {
    const limited = createGatewayClient({
      fetchImpl: async () => jsonResponse({ error: "rate_limited" }, 429),
    });
    const failed = createGatewayClient({
      fetchImpl: async () => jsonResponse({ error: "internal_error" }, 503),
    });

    await expect(limited.getOrder("order-1")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof GatewayApiError && error.retryable,
    );
    await expect(failed.getOrder("order-1")).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof GatewayApiError && error.retryable,
    );
  });
});

describe("gateway client cancellation", () => {
  it("times out a hanging request", async () => {
    const hanging: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    const client = createGatewayClient({
      fetchImpl: hanging,
      timeoutMs: 10,
    });

    await expect(client.getSession()).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      retryable: true,
    });
  });

  it("supports caller aborts", async () => {
    const controller = new AbortController();
    const hanging: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    const client = createGatewayClient({
      fetchImpl: hanging,
      timeoutMs: 10_000,
    });

    const request = client.getSession({ signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({
      code: "REQUEST_ABORTED",
      retryable: true,
    });
  });
});
