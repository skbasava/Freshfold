import type {
  Customer,
  LoginRequest,
  OrderDetail,
  OrderSummary,
} from "@laundry/contracts";
import { createIndexedDbBackend } from "../db/indexeddb";
import { createMemoryStorageBackend } from "../db/memory";
import type { StorageBackend } from "../db/types";
import { formatDateKey, localDateKey } from "../lib/format";
import { isMockApiError, MockApiError } from "../mocks/errors";
import { createMockApi } from "../mocks/api";
import type {
  AttentionItem,
  CreateOrderInput,
  CreateOrderOptions,
  CustomerListQuery,
  CustomerListResult,
  CustomerSummary,
  DashboardData,
  DashboardOrder,
  DeliverySchedule,
  DeliverySlotSummary,
  MockApi,
  MockCustomerDetail,
  MockDeliverySlot,
  MockOrderDetail,
  MockOrderIntent,
  MockOrderSummary,
  MockSession,
  OrderListQuery,
  OrderListResult,
  OrderMutationOptions,
} from "../mocks/types";
import { createOfflineOrder, updateOfflineOrder } from "../orders/offline";
import { localOrderFromServer } from "../orders/local-order";
import { createLockCoordinator } from "../sync/locks";
import { createMutationQueue } from "../sync/mutation-queue";
import {
  flushPendingMutations,
  type MutationTransport,
  type MutationTransportResult,
} from "../sync/submit";
import type { LocalOrder } from "../sync/types";
import {
  createGatewayClient,
  createMemoryCsrfStore,
  isGatewayApiError,
  type CsrfTokenStore,
  type FetchLike,
  type GatewayClient,
  type GatewayApiError,
} from "./client";
import { FALLBACK_SERVICES, getDemoFallbackApi } from "./fallbacks";
import {
  customerSummaryFromOrders,
  localOrderToMockDetail,
  mergeLocalOrderIntoDetail,
  orderDetailToMock,
  orderSummaryToMock,
} from "./mappers";
import type {
  ApiCapabilities,
  ApiConfig,
  AppApi,
} from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_PAGES = 5;
const PAGE_LIMIT = 100;

export type { ApiConfig, ApiCapabilities, AppApi } from "./types";

export interface CreateAppApiDependencies {
  fetchImpl?: FetchLike;
  csrfStore?: CsrfTokenStore;
  backend?: StorageBackend;
  now?: () => number;
  requestIdFactory?: () => string;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

export function readApiConfig(
  env: Record<string, string | boolean | undefined> = import.meta.env,
): ApiConfig {
  const mode =
    String(env.VITE_API_MODE ?? "mock").toLowerCase() === "live"
      ? "live"
      : "mock";
  const rawTimeout = Number(env.VITE_API_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  return {
    mode,
    baseUrl: String(env.VITE_API_BASE_URL ?? ""),
    timeoutMs:
      Number.isFinite(rawTimeout) && rawTimeout > 0
        ? rawTimeout
        : DEFAULT_TIMEOUT_MS,
    demoFallbacks: readBoolean(env.VITE_ENABLE_DEMO_FALLBACKS),
    requireAuth: readBoolean(env.VITE_REQUIRE_AUTH),
  };
}

export function createAppApi(
  config: ApiConfig = readApiConfig(),
  dependencies: CreateAppApiDependencies = {},
): AppApi {
  if (config.mode === "mock") {
    return createMockApi({
      latencyMs: 0,
      authRequired: config.requireAuth,
    });
  }
  return createLiveApi(config, dependencies);
}

function defaultBackend(): StorageBackend {
  try {
    return createIndexedDbBackend();
  } catch {
    return createMemoryStorageBackend();
  }
}

const liveCapabilities = (config: ApiConfig): ApiCapabilities => ({
  mode: "live",
  roleSwitch: false,
  deliverySlots: config.demoFallbacks ? "demo-fallback" : "unavailable",
  customerWrite: "unavailable",
  customerOrderHistory: "order-scan-fallback",
  services: "fallback",
  liveReads: true,
});

function mockCode(error: GatewayApiError): MockApiError["code"] {
  switch (error.status) {
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 429:
      return "RATE_LIMITED";
  }
  if (error.status >= 500) {
    return "SERVER_ERROR";
  }
  switch (error.code) {
    case "VERSION_CONFLICT":
      return "VERSION_CONFLICT";
    case "MUTATION_PAYLOAD_MISMATCH":
      return "MUTATION_PAYLOAD_MISMATCH";
    case "SLOT_FULL":
    case "INVALID_SLOT":
    case "INVALID_TRANSITION":
    case "INVALID_CUSTOMER":
    case "HOLD_COMMENT_REQUIRED":
      return error.code;
    case "REQUEST_TIMEOUT":
      return "REQUEST_TIMEOUT";
    case "NETWORK_ERROR":
      return "NETWORK_ERROR";
    default:
      return "VALIDATION_ERROR";
  }
}

export function describeGatewayError(error: GatewayApiError): string {
  if (error.status === 0 || error.code === "NETWORK_ERROR") {
    return "Cannot reach the local Gateway. Start the backend with `pnpm dev:live` and try again.";
  }
  switch (error.status) {
    case 401:
      return "Your session ended. Please sign in again.";
    case 403:
      return "You do not have permission to do that.";
    case 404:
      return "We could not find that item.";
    case 429:
      return "Too many changes at once. Wait a moment and try again.";
  }
  if (error.status >= 500) {
    return "The server is unavailable right now. Please try again.";
  }
  if (error.code === "VERSION_CONFLICT") {
    return "This order changed on another device. Review the latest details.";
  }
  if (error.code === "SLOT_FULL") {
    return "That delivery time is full.";
  }
  return "The server could not accept that change. Please try again.";
}

function toMockApiError(error: unknown): MockApiError {
  if (isMockApiError(error)) {
    return error;
  }
  if (!isGatewayApiError(error)) {
    return new MockApiError("Something went wrong. Please try again.", {
      status: 500,
      code: "SERVER_ERROR",
    });
  }

  const fieldErrors = error.details
    ? Object.fromEntries(
        error.details.map((detail) => [detail.path, detail.message]),
      )
    : undefined;

  return new MockApiError(describeGatewayError(error), {
    status: error.status === 0 ? 503 : error.status,
    code: mockCode(error),
    ...(fieldErrors && Object.keys(fieldErrors).length > 0
      ? { fieldErrors }
      : {}),
    ...(error.currentOrder
      ? { currentOrder: orderDetailToMock(error.currentOrder) }
      : {}),
  });
}

function clientTransport(client: GatewayClient): MutationTransport {
  return {
    async send(input): Promise<MutationTransportResult> {
      try {
        const result = await client.applyChange(input);
        return {
          kind: "accepted",
          order: result.order,
          replayed: result.replayed,
        };
      } catch (error) {
        if (!isGatewayApiError(error)) {
          throw error;
        }
        if (error.code === "VERSION_CONFLICT") {
          return {
            kind: "version_conflict",
            order: error.currentOrder,
            error: error.code,
          };
        }
        if (error.status === 401 || error.status === 403) {
          return {
            kind: "auth",
            status: error.status,
            error: error.code,
          };
        }
        if (error.retryable) {
          return {
            kind: "retryable",
            status: error.status,
            error: error.code,
          };
        }
        return {
          kind: "rejected",
          status: error.status,
          error: error.code,
          order: error.currentOrder,
        };
      }
    },
  };
}

function sortSummaries(
  summaries: MockOrderSummary[],
  sort: NonNullable<OrderListQuery["sort"]>,
): MockOrderSummary[] {
  return [...summaries].sort((left, right) => {
    if (sort === "oldest") {
      return left.createdAt - right.createdAt;
    }
    if (sort === "delivery") {
      if (left.deliveryAt === null) return 1;
      if (right.deliveryAt === null) return -1;
      return left.deliveryAt - right.deliveryAt;
    }
    return right.createdAt - left.createdAt;
  });
}

function isActive(order: MockOrderSummary): boolean {
  return order.status !== "cancelled" && order.status !== "delivered";
}

function matchesSearch(order: MockOrderSummary, search: string): boolean {
  if (!search) {
    return true;
  }
  return [
    order.id,
    order.customerName,
    order.customerPhone ?? "",
    order.serviceType,
  ]
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function matchesStatus(
  order: MockOrderSummary,
  status: NonNullable<OrderListQuery["status"]>,
): boolean {
  if (status === "all") return true;
  if (status === "attention") {
    return order.syncState !== "synced" || order.status === "hold";
  }
  return order.status === status;
}

function slotStatus(
  slot: MockDeliverySlot,
  date: string,
  today: string,
): MockDeliverySlot["status"] {
  if (date < today) return "past";
  if (slot.closedReason) return "closed";
  if (slot.booked >= slot.capacity) return "full";
  return "open";
}

function createLiveApi(
  config: ApiConfig,
  dependencies: CreateAppApiDependencies,
): AppApi {
  const client = createGatewayClient({
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    fetchImpl: dependencies.fetchImpl,
    csrfStore:
      dependencies.csrfStore ??
      (typeof document === "undefined" ? createMemoryCsrfStore() : undefined),
    requestIdFactory: dependencies.requestIdFactory,
  });
  const backend = dependencies.backend ?? defaultBackend();
  const queue = createMutationQueue(backend);
  const transport = clientTransport(client);
  const now = dependencies.now ?? (() => Date.now());
  const details = new Map<string, OrderDetail>();
  const customers = new Map<string, Customer>();
  let cachedSession: MockSession | null = null;

  async function session(): Promise<MockSession> {
    if (cachedSession) {
      return cachedSession;
    }
    try {
      const response = await client.getSession();
      cachedSession = {
        user: {
          name: response.user.displayName,
          role: response.role,
        },
        hub: {
          id: response.hub.id,
          name: response.hub.id,
        },
        today: now(),
      };
      return cachedSession;
    } catch (error) {
      throw toMockApiError(error);
    }
  }

  async function fetchAllOrders(): Promise<OrderSummary[]> {
    const all: OrderSummary[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await client.listOrders({
        limit: PAGE_LIMIT,
        cursor,
      });
      all.push(...response.items);
      if (!response.nextCursor) {
        break;
      }
      cursor = response.nextCursor;
    }
    return all;
  }

  async function fetchAllCustomers(): Promise<Customer[]> {
    const all: Customer[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await client.listCustomers({
        limit: PAGE_LIMIT,
        cursor,
      });
      all.push(...response.items);
      if (!response.nextCursor) {
        break;
      }
      cursor = response.nextCursor;
    }
    return all;
  }

  async function detailFor(order: OrderSummary): Promise<OrderDetail | null> {
    const cached = details.get(order.id);
    if (cached && cached.version === order.version) {
      return cached;
    }
    try {
      const detail = await client.getOrder(order.id);
      details.set(order.id, detail);
      customers.set(detail.customer.id, detail.customer);
      return detail;
    } catch (error) {
      if (isGatewayApiError(error) && error.status === 404) {
        return null;
      }
      throw toMockApiError(error);
    }
  }

  async function mergedSummaries(): Promise<MockOrderSummary[]> {
    const [serverOrders, localOrders] = await Promise.all([
      fetchAllOrders(),
      backend.listOrders(),
    ]);
    const localById = new Map(localOrders.map((order) => [order.id, order]));
    const serverIds = new Set(serverOrders.map((order) => order.id));
    const summaries = serverOrders.map((order) => {
      const local = localById.get(order.id);
      const base = orderSummaryToMock(order);
      return local && local.syncState !== "synced"
        ? orderSummaryToMock(order, {
            syncState: local.syncState,
            lastError: local.lastError,
          })
        : base;
    });

    for (const local of localOrders) {
      if (serverIds.has(local.id)) {
        continue;
      }
      const mutations = await queue.listMutations(local.id);
      const detail = localOrderToMockDetail(local, mutations);
      summaries.push({
        id: local.id,
        customerId: local.customerId,
        customerName: local.customerName,
        customerPhone: local.customerPhone,
        status: local.status,
        serviceType: local.serviceType,
        deliverySlotId: local.deliverySlotId,
        deliveryAt: local.deliveryAt,
        version: local.version,
        holdComment: local.holdComment,
        createdAt: local.createdAt,
        updatedAt: local.updatedAt,
        cancelledAt: local.cancelledAt ?? null,
        totalItems: detail.totalItems,
        syncState: local.syncState,
        lastError: local.lastError ?? null,
      });
    }

    return summaries;
  }

  async function enrichSummary(
    summary: MockOrderSummary,
  ): Promise<MockOrderSummary> {
    if (summary.totalItems > 0) {
      return summary;
    }
    try {
      const detail = await client.getOrder(summary.id);
      details.set(summary.id, detail);
      return {
        ...summary,
        totalItems: orderDetailToMock(detail).totalItems,
      };
    } catch {
      return summary;
    }
  }

  async function localDetail(orderId: string): Promise<MockOrderDetail | null> {
    const local = await queue.getOrder(orderId);
    if (!local) {
      return null;
    }
    const mutations = await queue.listMutations(orderId);
    let customer = customers.get(local.customerId);
    if (!customer) {
      try {
        customer = await client.getCustomer(local.customerId);
        customers.set(customer.id, customer);
      } catch {
        customer = undefined;
      }
    }
    return localOrderToMockDetail(local, mutations, customer);
  }

  async function loadOrderDetail(orderId: string): Promise<MockOrderDetail | null> {
    const local = await queue.getOrder(orderId);
    let server: OrderDetail | null = null;
    try {
      server = await client.getOrder(orderId);
      details.set(orderId, server);
      customers.set(server.customer.id, server.customer);
    } catch (error) {
      if (!(isGatewayApiError(error) && error.status === 404)) {
        throw toMockApiError(error);
      }
    }

    if (server) {
      if (!local || local.syncState === "synced") {
        await backend.runTransaction(["orders"], "readwrite", (tx) =>
          tx.putOrder(localOrderFromServer(server)),
        );
        return orderDetailToMock(server);
      }
      return mergeLocalOrderIntoDetail(orderDetailToMock(server), local);
    }

    if (local && local.syncState !== "synced") {
      return localDetail(orderId);
    }
    return null;
  }

  async function settleMutation(
    orderId: string,
    mutationId: string,
    online: boolean,
  ): Promise<MockOrderDetail> {
    if (online) {
      try {
        const summary = await flushPendingMutations({
          queue,
          transport,
          withOrderLock: createLockCoordinator({
            hubId: (await session()).hub.id,
          }).withOrderLock,
        });
        if (summary.paused > 0) {
          throw new MockApiError("Your session ended. Please sign in again.", {
            status: 401,
            code: "UNAUTHORIZED",
          });
        }
      } catch (error) {
        if (isMockApiError(error)) {
          throw error;
        }
        return (await localDetail(orderId)) as MockOrderDetail;
      }
    }

    const mutation = await queue.getMutation(mutationId);
    if (!mutation) {
      throw new MockApiError("We could not save that change.", {
        status: 500,
        code: "SERVER_ERROR",
      });
    }

    if (mutation.status === "synced") {
      const detail = await loadOrderDetail(orderId);
      if (detail) {
        return detail;
      }
    }

    if (mutation.status === "conflict") {
      const current = await localDetail(orderId);
      throw new MockApiError(
        "This order changed on another device. Review the latest details.",
        {
          status: 409,
          code: "VERSION_CONFLICT",
          ...(current ? { currentOrder: current } : {}),
        },
      );
    }

    if (mutation.status === "rejected") {
      const current = await localDetail(orderId);
      const code =
        mutation.lastError === "HOLD_COMMENT_REQUIRED"
          ? "HOLD_COMMENT_REQUIRED"
          : mutation.lastError === "SLOT_FULL"
            ? "SLOT_FULL"
            : mutation.lastError === "MUTATION_PAYLOAD_MISMATCH"
              ? "MUTATION_PAYLOAD_MISMATCH"
              : "VALIDATION_ERROR";
      throw new MockApiError(
        code === "HOLD_COMMENT_REQUIRED"
          ? "Add a short reason for the hold."
          : code === "SLOT_FULL"
            ? "That delivery time is full."
            : "The server could not accept this change. Please try again.",
        {
          status: 422,
          code,
          ...(current ? { currentOrder: current } : {}),
        },
      );
    }

    const detail = await localDetail(orderId);
    if (!detail) {
      throw new MockApiError("We could not find that order.", {
        status: 404,
        code: "NOT_FOUND",
      });
    }
    return detail;
  }

  async function ensureLocalOrder(
    orderId: string,
    baseVersion: number,
  ): Promise<LocalOrder | null> {
    const local = await queue.getOrder(orderId);
    if (
      local &&
      (local.syncState !== "synced" || local.version === baseVersion)
    ) {
      return local;
    }
    try {
      const server = await client.getOrder(orderId);
      details.set(orderId, server);
      customers.set(server.customer.id, server.customer);
      const synced = localOrderFromServer(server);
      await backend.runTransaction(["orders"], "readwrite", (tx) =>
        tx.putOrder(synced),
      );
      return synced;
    } catch (error) {
      if (isGatewayApiError(error) && error.status === 404) {
        return local ?? null;
      }
      throw toMockApiError(error);
    }
  }

  function scheduleFor(
    date: string,
    orders: MockOrderSummary[],
    slots: MockDeliverySlot[],
  ): DeliverySchedule {
    const today = localDateKey(now());
    const adjusted = slots.map((slot) => {
      const booked = orders.filter(
        (order) =>
          order.deliverySlotId === slot.id && isActive(order),
      ).length;
      const next: MockDeliverySlot = {
        ...slot,
        booked,
        available: Math.max(0, slot.capacity - booked),
      };
      next.status = slotStatus(next, date, today);
      return next;
    });
    const capacity = adjusted.reduce(
      (total, slot) => total + slot.capacity,
      0,
    );
    const booked = adjusted.reduce((total, slot) => total + slot.booked, 0);

    return {
      date,
      dateLabel: formatDateKey(date),
      slots: adjusted,
      orders: orders.filter(
        (order) =>
          isActive(order) &&
          order.deliveryAt !== null &&
          localDateKey(order.deliveryAt) === date,
      ),
      capacity,
      booked,
      available: Math.max(0, capacity - booked),
    };
  }

  async function slotsFor(
    date: string,
    orders: MockOrderSummary[],
  ): Promise<MockDeliverySlot[]> {
    if (!config.demoFallbacks) {
      return [];
    }
    const fallback = await getDemoFallbackApi().getDeliverySchedule(date);
    return scheduleFor(date, orders, fallback.slots).slots;
  }

  const api: AppApi = {
    mode: "live",
    capabilities: liveCapabilities(config),

    async login(input: LoginRequest) {
      try {
        const response = await client.login(input);
        cachedSession = {
          user: {
            name: response.user.displayName,
            role: response.role,
          },
          hub: { id: response.hub.id, name: response.hub.id },
          today: now(),
        };
        return cachedSession;
      } catch (error) {
        throw toMockApiError(error);
      }
    },

    async logout() {
      try {
        await client.logout();
      } catch {
        // Clearing local auth state is the safest outcome if the server is down.
      }
      cachedSession = null;
    },

    async getSession() {
      return session();
    },

    setRole() {
      // Roles are server-owned. The live adapter never trusts a client role.
    },

    async getDashboardData(): Promise<DashboardData> {
      const [summaries, customerList] = await Promise.all([
        mergedSummaries(),
        fetchAllCustomers(),
      ]);
      const today = localDateKey(now());
      const todaySummaries = summaries.filter(
        (order) => localDateKey(order.createdAt) === today,
      );
      const todaySlots = await slotsFor(today, summaries);
      const attention: AttentionItem[] = [];

      for (const order of summaries) {
        if (order.syncState === "conflict") {
          attention.unshift({
            id: `sync-${order.id}`,
            orderId: order.id,
            customerName: order.customerName,
            reason: "A change was made on another device while this order waited.",
            status: "conflict",
            tone: "danger",
            actionLabel: "Review changes",
            href: `/orders/${order.id}`,
          });
        } else if (order.syncState === "rejected") {
          attention.unshift({
            id: `rejected-${order.id}`,
            orderId: order.id,
            customerName: order.customerName,
            reason: "The server could not accept the last change.",
            status: order.status,
            tone: "danger",
            actionLabel: "Review order",
            href: `/orders/${order.id}`,
          });
        } else if (order.status === "hold") {
          attention.push({
            id: `hold-${order.id}`,
            orderId: order.id,
            customerName: order.customerName,
            reason: order.holdComment ?? "This order is on hold.",
            status: "hold",
            tone: "warning",
            actionLabel: "Open order",
            href: `/orders/${order.id}`,
          });
        }
      }

      const recent = await Promise.all(
        sortSummaries(summaries, "newest")
          .slice(0, 6)
          .map(enrichSummary),
      );
      const toDashboard = (order: MockOrderSummary): DashboardOrder => ({
        id: order.id,
        customerName: order.customerName,
        customerPhone:
          customerList.find((customer) => customer.id === order.customerId)
            ?.phone ?? "",
        status: order.status,
        serviceType: order.serviceType,
        deliveryAt: order.deliveryAt,
        totalItems: order.totalItems,
        syncState: order.syncState,
        version: order.version,
      });

      return {
        summary: {
          ordersToday: todaySummaries.length,
          readyForDelivery: summaries.filter(
            (order) => order.status === "processing",
          ).length,
          outForDelivery: summaries.filter(
            (order) => order.status === "out_for_delivery",
          ).length,
          needsAttention: attention.length,
          capacityUsed: todaySlots.reduce(
            (total, slot) => total + slot.booked,
            0,
          ),
          capacityTotal: todaySlots.reduce(
            (total, slot) => total + slot.capacity,
            0,
          ),
        },
        attention,
        recentOrders: recent.map(toDashboard),
        customers: customerList,
        deliverySlots: todaySlots.map(
          (slot): DeliverySlotSummary => ({
            id: slot.id,
            label: slot.label,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            capacity: slot.capacity,
            booked: slot.booked,
            available: slot.available,
          }),
        ),
        deliveryOrders: summaries.filter(isActive).map(toDashboard),
      };
    },

    async getSummary() {
      return (await api.getDashboardData()).summary;
    },

    async getAttentionItems() {
      return (await api.getDashboardData()).attention;
    },

    async getRecentOrders(limit = 6) {
      const result = await api.listOrders({
        sort: "newest",
        pageSize: limit,
      });
      return result.items.map((order): DashboardOrder => ({
        id: order.id,
        customerName: order.customerName,
        customerPhone: "",
        status: order.status,
        serviceType: order.serviceType,
        deliveryAt: order.deliveryAt,
        totalItems: order.totalItems,
        syncState: order.syncState,
        version: order.version,
      }));
    },

    async getCustomers(query = ""): Promise<CustomerSummary[]> {
      const result = await api.listCustomers({ search: query, pageSize: 50 });
      return result.items;
    },

    async getDeliverySlots() {
      return (await api.getDashboardData()).deliverySlots;
    },

    async getDeliveryOrders() {
      return (await api.getDashboardData()).deliveryOrders;
    },

    async listOrders(query: OrderListQuery = {}): Promise<OrderListResult> {
      const summaries = await mergedSummaries();
      const search = (query.search ?? "").trim().toLowerCase();
      const status = query.status ?? "all";
      const sort = query.sort ?? "newest";
      const pageSize = Math.min(Math.max(query.pageSize ?? 4, 1), 50);
      const filtered = sortSummaries(
        summaries.filter(
          (order) =>
            matchesSearch(order, search) && matchesStatus(order, status),
        ),
        sort,
      );
      const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
      const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
      const items = await Promise.all(
        filtered
          .slice((page - 1) * pageSize, page * pageSize)
          .map(enrichSummary),
      );

      return {
        items,
        total: filtered.length,
        page,
        pageSize,
        pageCount,
      };
    },

    async getOrder(orderId: string): Promise<MockOrderDetail | null> {
      return loadOrderDetail(orderId);
    },

    async getCreateOrderOptions(): Promise<CreateOrderOptions> {
      const result = await api.listCustomers({ pageSize: 100 });
      const slots =
        config.demoFallbacks
          ? (await getDemoFallbackApi().getCreateOrderOptions()).slots
          : [];
      return {
        customers: result.items,
        services: [...FALLBACK_SERVICES],
        slots,
      };
    },

    async createOrder(
      input: CreateOrderInput,
      mutationOptions: OrderMutationOptions = {},
    ): Promise<MockOrderDetail> {
      const current = await session();
      const options = await api.getCreateOrderOptions();
      const customer = options.customers.find(
        (entry) => entry.id === input.customerId,
      );
      if (!customer) {
        throw new MockApiError("Choose a customer.", {
          status: 422,
          code: "VALIDATION_ERROR",
          fieldErrors: { customerId: "Choose a customer." },
        });
      }
      const slot = options.slots.find(
        (entry) => entry.id === input.deliverySlotId,
      );
      if (!slot) {
        throw new MockApiError(
          config.demoFallbacks
            ? "Choose a delivery time."
            : "Delivery times are not available from the server yet.",
          {
            status: 422,
            code: "SLOT_NOT_FOUND",
            fieldErrors: {
              deliverySlotId: config.demoFallbacks
                ? "Choose a delivery time."
                : "Delivery times are not available from the server yet.",
            },
          },
        );
      }

      const created = await createOfflineOrder(queue, {
        hubId: current.hub.id,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        serviceType: input.serviceType,
        deliverySlotId: slot.id,
        deliveryAt: slot.startsAt,
        items: input.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
        })),
        now: now(),
      });

      return settleMutation(
        created.order.id,
        created.mutation.mutationId,
        mutationOptions.online ?? true,
      );
    },

    async applyOrderIntent(
      orderId: string,
      intent: MockOrderIntent,
      payload: unknown,
      baseVersion: number,
      mutationOptions: OrderMutationOptions = {},
    ): Promise<MockOrderDetail> {
      const local = await ensureLocalOrder(orderId, baseVersion);
      if (!local) {
        throw new MockApiError("We could not find that order.", {
          status: 404,
          code: "NOT_FOUND",
        });
      }
      const updated = await updateOfflineOrder(queue, {
        orderId,
        intent,
        payload,
        now: now(),
      });
      return settleMutation(
        orderId,
        updated.mutation.mutationId,
        mutationOptions.online ?? true,
      );
    },

    async getDeliverySchedule(date?: string): Promise<DeliverySchedule> {
      const dateKey = date ?? localDateKey(now());
      const summaries = await mergedSummaries();
      const slots = await slotsFor(dateKey, summaries);
      const orders = await Promise.all(
        summaries
          .filter(
            (order) =>
              isActive(order) &&
              order.deliveryAt !== null &&
              localDateKey(order.deliveryAt) === dateKey,
          )
          .map(enrichSummary),
      );
      return scheduleFor(dateKey, orders, slots);
    },

    async listCustomers(
      query: CustomerListQuery = {},
    ): Promise<CustomerListResult> {
      const [customerList, summaries] = await Promise.all([
        fetchAllCustomers(),
        mergedSummaries(),
      ]);
      const search = (query.search ?? "").trim().toLowerCase();
      const pageSize = Math.min(Math.max(query.pageSize ?? 10, 1), 50);
      const filtered = customerList
        .filter((customer) => {
          if (!search) return true;
          return (
            customer.name.toLowerCase().includes(search) ||
            customer.phone.replace(/\s/g, "").includes(search)
          );
        })
        .sort((left, right) => left.name.localeCompare(right.name));
      const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
      const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
      const items = filtered
        .slice((page - 1) * pageSize, page * pageSize)
        .map((customer) => customerSummaryFromOrders(customer, summaries));

      return {
        items,
        total: filtered.length,
        page,
        pageSize,
        pageCount,
      };
    },

    async getCustomer(
      customerId: string,
    ): Promise<MockCustomerDetail | null> {
      let customer: Customer;
      try {
        customer = await client.getCustomer(customerId);
        customers.set(customer.id, customer);
      } catch (error) {
        if (isGatewayApiError(error) && error.status === 404) {
          return null;
        }
        throw toMockApiError(error);
      }

      const summaries = await mergedSummaries();
      const orders = await Promise.all(
        summaries
          .filter((order) => order.customerId === customerId)
          .sort((left, right) => right.createdAt - left.createdAt)
          .map(enrichSummary),
      );

      return { customer, orders };
    },

    async syncPendingMutations() {
      await flushPendingMutations({
        queue,
        transport,
        withOrderLock: createLockCoordinator({
          hubId: (await session()).hub.id,
        }).withOrderLock,
      });
    },

    async getPendingCount() {
      return (await queue.listMutations()).filter(
        (mutation) => mutation.status === "pending",
      ).length;
    },
  };

  return api;
}

