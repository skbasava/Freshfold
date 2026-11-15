import {
  deriveCustomerId,
  normalizePhone,
  type CreateHubRequest,
  type CreateTenantRequest,
  type DeleteHubResponse,
  type DeleteTenantResponse,
  type Hub,
  type HubListResponse,
  type LoginRequest,
  type OrderEventsResponse,
  type OrderStateSnapshot,
  type OrderStatus,
  type Role,
  type Tenant,
  type TenantListResponse,
  type UpdateHubRequest,
  type UpdateTenantRequest,
} from "@laundry/contracts";
import type {
  ApiCapabilities,
  AppApi,
} from "../../api/types";
import { MockApiError } from "./errors";
import {
  createMockData,
  createMockStore,
  formatScheduleDate,
  MOCK_HUB_ID,
  MOCK_HUB_NAME,
  MOCK_NOW,
  MOCK_SERVICES,
  refreshSlot,
  toOrderSummary,
  type MockApiOptions,
  type MockDeliverySlot,
  type MockOrderRecord,
  type MockOrderSummary,
  type MockStore,
} from "./data";
import type {
  CreateOrderInput,
  CreateOrderOptions,
  CustomerDetail,
  CustomerListItem,
  CustomerListQuery,
  CustomerListResult,
  CustomerSummary,
  DeliverySchedule,
  OrderDetail,
  OrderIntent,
  OrderListQuery,
  OrderListResult,
  OrderMutationOptions,
  OrderSummary,
  UpdateOrderInput,
} from "../../types";

export type MockCustomerDetail = CustomerDetail;
export type MockCustomerSummary = CustomerListItem;
export type MockOrderDetail = OrderDetail;
export type MockOrderIntent = OrderIntent;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

const rolePermissions: Record<Role, ReadonlySet<string>> = {
  front_desk: new Set([
    "view_orders",
    "create_order",
    "update_order_status",
    "view_calendar",
  ]),
  counter_staff: new Set([
    "view_orders",
    "create_order",
    "update_order_status",
    "view_calendar",
  ]),
  operator: new Set([
    "view_orders",
    "update_order_status",
  ]),
  finance: new Set([
    "view_orders",
    "view_audit",
  ]),
  owner: new Set([
    "view_orders",
    "create_order",
    "reschedule_order",
    "update_order_status",
    "cancel_order",
    "view_calendar",
    "manage_calendar",
    "manage_users",
    "replay_dlq",
    "view_audit",
    "internal_service",
    "view_tenants",
    "manage_tenants",
  ]),
  super_admin: new Set([
    "view_orders",
    "create_order",
    "reschedule_order",
    "update_order_status",
    "cancel_order",
    "view_calendar",
    "manage_calendar",
    "manage_users",
    "replay_dlq",
    "view_audit",
    "internal_service",
    "view_tenants",
    "manage_tenants",
  ]),
  manager: new Set([
    "view_orders",
    "create_order",
    "reschedule_order",
    "update_order_status",
    "cancel_order",
    "view_calendar",
    "manage_calendar",
    "manage_users",
    "replay_dlq",
    "view_audit",
    "internal_service",
  ]),
  service: new Set(["internal_service"]),
};

function can(role: Role, permission: string): boolean {
  return rolePermissions[role].has(permission);
}

function permissionForIntent(intent: MockOrderIntent): string {
  switch (intent) {
    case "reschedule":
      return "reschedule_order";
    case "cancel":
      return "cancel_order";
    default:
      return "update_order_status";
  }
}

function nextStatus(
  current: OrderStatus,
  intent: MockOrderIntent,
): OrderStatus | null {
  switch (intent) {
    case "markProcessing":
      return current === "confirmed" ? "processing" : null;
    case "placeOnHold":
      return current === "confirmed" || current === "processing"
        ? "hold"
        : null;
    case "releaseHold":
      return current === "hold" ? "processing" : null;
    case "markOutForDelivery":
      return current === "processing" ? "out_for_delivery" : null;
    case "markDelivered":
      return current === "out_for_delivery" ? "delivered" : null;
    case "reschedule":
      return current === "confirmed" ||
        current === "processing" ||
        current === "hold"
        ? current
        : null;
    case "cancel":
      return current === "confirmed" ||
        current === "processing" ||
        current === "hold"
        ? "cancelled"
        : null;
  }
}

function cloneSummary(order: MockOrderRecord): MockOrderSummary {
  return { ...toOrderSummary(order) };
}

function cloneSlot(slot: MockDeliverySlot): MockDeliverySlot {
  return { ...slot };
}

function findSlot(
  store: MockStore,
  slotId: string,
): MockDeliverySlot | undefined {
  return store.slots.find((slot) => slot.id === slotId);
}

function assertSlotAvailable(slot: MockDeliverySlot): void {
  if (slot.status === "past") {
    throw new MockApiError("That delivery time has already passed.", {
      status: 422,
      code: "SLOT_PAST",
    });
  }
  if (slot.status === "closed") {
    throw new MockApiError("That delivery time is closed.", {
      status: 422,
      code: "SLOT_CLOSED",
    });
  }
  if (slot.status === "full" || slot.available <= 0) {
    throw new MockApiError("That delivery time is full.", {
      status: 422,
      code: "SLOT_FULL",
    });
  }
}

function orderDetail(
  store: MockStore,
  order: MockOrderRecord,
): MockOrderDetail {
  const customer = store.customers.find(
    (entry) => entry.id === order.customerId,
  );

  const slot = order.deliverySlotId
    ? store.slots.find((entry) => entry.id === order.deliverySlotId)
    : undefined;

  return {
    ...cloneSummary(order),
    customer: customer
      ? { ...customer }
      : {
          id: order.customerId,
          hubId: MOCK_HUB_ID,
          name: order.customerName,
          phone: "",
          notes: null,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
    items: order.items.map((item) => ({ ...item })),
    deliverySlot: slot ? cloneSlot(slot) : null,
  };
}

function findOrder(store: MockStore, orderId: string): MockOrderRecord {
  const order = store.orders.find((entry) => entry.id === orderId);
  if (!order) {
    throw new MockApiError("We could not find that order.", {
      status: 404,
      code: "NOT_FOUND",
    });
  }
  return order;
}

function needsAttention(order: MockOrderSummary): boolean {
  return order.syncState !== "synced" || order.status === "hold";
}

function matchesSearch(
  order: MockOrderRecord,
  search: string,
  store: MockStore,
): boolean {
  if (!search) {
    return true;
  }
  const customer = store.customers.find(
    (entry) => entry.id === order.customerId,
  );
  const haystack = [
    order.id,
    order.customerName,
    order.serviceType,
    customer?.phone ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(search);
}

function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageCount,
  };
}

function customerSummary(
  store: MockStore,
  customer: CustomerSummary,
): MockCustomerSummary {
  const orders = store.orders.filter(
    (order) => order.customerId === customer.id,
  );
  const timestamps = orders
    .map((order) => order.createdAt)
    .filter((value): value is number => typeof value === "number");

  return {
    ...customer,
    orderCount: orders.length,
    lastOrderAt:
      timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

const mockCapabilities: ApiCapabilities = {
  mode: "mock",
  roleSwitch: true,
  deliverySlots: "available",
  customerWrite: "unavailable",
  customerOrderHistory: "available",
  services: "available",
  liveReads: false,
};

export function createMockApi(options: MockApiOptions = {}): AppApi {
  const latencyMs = options.latencyMs ?? 120;
  const data = createMockData(options);
  const store = createMockStore(options);
  let currentRole: Role = options.role ?? "front_desk";
  let authenticated = !options.authRequired;

  async function withLatency<T>(operation: () => T | Promise<T>): Promise<T> {
    await wait(latencyMs);
    if (options.fail) {
      throw new Error("Mock API is unavailable");
    }
    return operation();
  }

  function session() {
    return {
      user: {
        name: "Riya Sharma",
        role: currentRole,
      },
      hub: {
        id: MOCK_HUB_ID,
        name: MOCK_HUB_NAME,
      },
      today: options.today ?? MOCK_NOW,
    };
  }

  function applyOrderIntentSync(
    orderId: string,
    intent: MockOrderIntent,
    payload: unknown,
    baseVersion: number,
    mutationOptions: OrderMutationOptions = {},
  ): MockOrderDetail {
    const order = findOrder(store, orderId);

    if (!can(currentRole, permissionForIntent(intent))) {
      throw new MockApiError(
        intent === "reschedule" || intent === "cancel"
          ? "Only a manager can do this."
          : "You do not have permission to change this order.",
        { status: 403, code: "FORBIDDEN" },
      );
    }

    if (baseVersion !== order.version) {
      throw new MockApiError(
        "This order changed on another device. Review the latest details.",
        {
          status: 409,
          code: "VERSION_CONFLICT",
          currentOrder: orderDetail(store, order),
        },
      );
    }

    let holdComment = order.holdComment;
    let slot: MockDeliverySlot | undefined;

    if (intent === "placeOnHold") {
      const comments =
        payload !== null &&
        typeof payload === "object" &&
        "comments" in payload &&
        typeof payload.comments === "string"
          ? payload.comments.trim()
          : "";
      if (!comments) {
        throw new MockApiError(
          "Add a short reason for the hold.",
          { status: 422, code: "HOLD_COMMENT_REQUIRED" },
        );
      }
      holdComment = comments;
    }

    if (intent === "reschedule") {
      const slotId =
        payload !== null &&
        typeof payload === "object" &&
        "deliverySlotId" in payload &&
        typeof payload.deliverySlotId === "string"
          ? payload.deliverySlotId
          : "";
      slot = findSlot(store, slotId);
      if (!slot) {
        throw new MockApiError("Choose a delivery time.", {
          status: 422,
          code: "SLOT_NOT_FOUND",
        });
      }
    }

    const status = nextStatus(order.status, intent);
    if (status === null) {
      throw new MockApiError(
        "This order cannot make that change right now.",
        { status: 422, code: "INVALID_TRANSITION" },
      );
    }

    const oldSlot = order.deliverySlotId
      ? findSlot(store, order.deliverySlotId)
      : undefined;

    if (
      intent === "reschedule" &&
      slot &&
      slot.id !== order.deliverySlotId
    ) {
      assertSlotAvailable(slot);
      if (oldSlot) {
        oldSlot.booked = Math.max(0, oldSlot.booked - 1);
        refreshSlot(oldSlot, store.todayKey);
      }
      slot.booked += 1;
      refreshSlot(slot, store.todayKey);
      order.deliverySlotId = slot.id;
      order.deliveryAt = slot.startsAt;
    }

    if (intent === "cancel") {
      if (oldSlot) {
        oldSlot.booked = Math.max(0, oldSlot.booked - 1);
        refreshSlot(oldSlot, store.todayKey);
      }
      order.deliverySlotId = null;
      order.deliveryAt = null;
      order.cancelledAt = store.now;
      order.holdComment = null;
    } else if (intent === "markDelivered") {
      if (oldSlot) {
        oldSlot.booked = Math.max(0, oldSlot.booked - 1);
        refreshSlot(oldSlot, store.todayKey);
      }
    } else if (intent === "releaseHold") {
      order.holdComment = null;
    } else if (intent === "placeOnHold") {
      order.holdComment = holdComment;
    }

    order.status = status;
    order.version += 1;
    order.updatedAt = store.now;
    order.syncState =
      mutationOptions.online === false ? "pending" : "synced";
    order.lastError = null;

    return orderDetail(store, order);
  }

  return {
    mode: "mock",
    capabilities: mockCapabilities,
    getDashboardData() {
      return withLatency(() => data);
    },
    getSummary() {
      return withLatency(() => data.summary);
    },
    getAttentionItems() {
      return withLatency(() => data.attention);
    },
    getRecentOrders(limit = 6) {
      return withLatency(() => data.recentOrders.slice(0, limit));
    },
    getCustomers(query = ""): Promise<CustomerSummary[]> {
      return withLatency(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) {
          return store.customers;
        }
        return store.customers.filter(
          (customer) =>
            customer.name.toLowerCase().includes(normalized) ||
            customer.phone.replace(/\s/g, "").includes(normalized),
        );
      });
    },
    getDeliverySlots() {
      return withLatency(() => data.deliverySlots);
    },
    getDeliveryOrders() {
      return withLatency(() => data.deliveryOrders);
    },
    getSession() {
      return withLatency(() => {
        if (!authenticated) {
          throw new MockApiError("Please sign in to continue.", {
            status: 401,
            code: "UNAUTHORIZED",
          });
        }
        return session();
      });
    },
    login(input: LoginRequest) {
      return withLatency(() => {
        if (!input.email.trim() || !input.password) {
          throw new MockApiError("Enter your email and password.", {
            status: 422,
            code: "VALIDATION_ERROR",
          });
        }
        authenticated = true;
        return session();
      });
    },
    logout() {
      return withLatency(() => {
        authenticated = false;
      });
    },
    setRole(role) {
      currentRole = role;
    },
    async syncPendingMutations() {
      return undefined;
    },
    async getPendingCount() {
      return 0;
    },
    listOrders(query: OrderListQuery = {}): Promise<OrderListResult> {
      return withLatency(() => {
        const search = (query.search ?? "").trim().toLowerCase();
        const status = query.status ?? "all";
        const sort = query.sort ?? "newest";
        const pageSize = Math.min(Math.max(query.pageSize ?? 4, 1), 50);

        const filtered = store.orders.filter((order) => {
          if (!matchesSearch(order, search, store)) {
            return false;
          }
          if (status === "all") {
            return true;
          }
          if (status === "attention") {
            return needsAttention(order);
          }
          return order.status === status;
        });

        filtered.sort((left, right) => {
          if (sort === "oldest") {
            return left.createdAt - right.createdAt;
          }
          if (sort === "delivery") {
            if (left.deliveryAt === null) {
              return 1;
            }
            if (right.deliveryAt === null) {
              return -1;
            }
            return left.deliveryAt - right.deliveryAt;
          }
          return right.createdAt - left.createdAt;
        });

        const page = paginate(filtered, query.page ?? 1, pageSize);
        return {
          items: page.items.map(cloneSummary),
          total: filtered.length,
          page: page.page,
          pageSize,
          pageCount: page.pageCount,
        };
      });
    },
    getOrder(orderId: string): Promise<MockOrderDetail | null> {
      return withLatency(() => {
        const order = store.orders.find((entry) => entry.id === orderId);
        return order ? orderDetail(store, order) : null;
      });
    },
    getOrderState(orderId: string): Promise<OrderStateSnapshot | null> {
      return withLatency(() => {
        const order = store.orders.find((entry) => entry.id === orderId);
        if (!order) return null;
        const diagStatus =
          order.status === "cancelled"
            ? "cancelled"
            : order.status === "hold"
              ? "held"
              : "healthy";
        return {
          crnId: order.crnId ?? `crn:1:1:${order.version}`,
          orderId: order.id,
          tenantId: "tenant_default",
          hubId: "hub_default",
          previousState: order.previousState ?? null,
          currentState: order.status,
          intent: "createOrder",
          version: order.version,
          changedAt: order.updatedAt,
          actor: {
            actorType: "user",
            actorId: "mock_user",
            role: currentRole,
          },
          diagnostic: {
            status: diagStatus,
            reason: order.holdComment ?? null,
            brokenStep: null,
            lastMutationId: `mock-mut-${order.version}`,
            errorCode: null,
            errorMessage: null,
          },
        };
      });
    },
    getOrderEvents(orderId: string): Promise<OrderEventsResponse> {
      return withLatency(() => {
        const order = store.orders.find((entry) => entry.id === orderId);
        if (!order) return { items: [] };
        return {
          items: [
            {
              id: `evt-${order.id}-1`,
              hubId: "hub_default",
              orderId: order.id,
              mutationId: `mut-init-${order.id}`,
              eventType: "order_created",
              source: "app",
              actorType: "user",
              actorId: "mock_user",
              previousVersion: 0,
              newVersion: 1,
              at: order.createdAt,
              detail: { serviceType: order.serviceType },
            },
            ...(order.status !== "confirmed"
              ? [
                  {
                    id: `evt-${order.id}-2`,
                    hubId: "hub_default",
                    orderId: order.id,
                    mutationId: `mut-update-${order.id}`,
                    eventType: `order_${order.status}`,
                    source: "app" as const,
                    actorType: "user" as const,
                    actorId: "mock_user",
                    previousVersion: 1,
                    newVersion: order.version,
                    at: order.updatedAt,
                    detail: order.holdComment ? { comments: order.holdComment } : {},
                  },
                ]
              : []),
          ],
        };
      });
    },
    getCreateOrderOptions(): Promise<CreateOrderOptions> {
      return withLatency(() => ({
        customers: [...store.customers].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
        services: [...MOCK_SERVICES],
        slots: store.slots
          .filter((slot) => slot.localDate >= store.todayKey)
          .map(cloneSlot),
      }));
    },
    createOrder(
      input: CreateOrderInput,
      mutationOptions: OrderMutationOptions = {},
    ): Promise<MockOrderDetail> {
      return withLatency(async () => {
        const fieldErrors: Record<string, string> = {};
        const slot = findSlot(store, input.deliverySlotId);
        const items = input.items
          .map((item) => ({
            description: item.description.trim(),
            quantity: item.quantity,
          }))
          .filter((item) => item.description.length > 0);

        let customer: CustomerSummary | undefined;
        let pendingName = "";
        let pendingPhone = "";

        if ("customerId" in input) {
          customer = store.customers.find(
            (entry) => entry.id === input.customerId,
          );
          if (!customer) {
            fieldErrors.customerId = "Choose a customer.";
          }
        } else {
          pendingName = input.customerName.trim();
          pendingPhone = normalizePhone(input.customerPhone) ?? "";
          if (!pendingName) {
            fieldErrors.customerName = "Enter the customer's name.";
          }
          if (!pendingPhone) {
            fieldErrors.customerPhone = "Enter a valid phone number.";
          }
          if (pendingPhone) {
            customer = store.customers.find(
              (entry) => normalizePhone(entry.phone) === pendingPhone,
            );
          }
        }

        if (!input.serviceType.trim()) {
          fieldErrors.serviceType = "Choose a service.";
        }
        if (!slot) {
          fieldErrors.deliverySlotId = "Choose a delivery time.";
        }
        if (items.length === 0) {
          fieldErrors.items = "Add at least one item.";
        } else if (
          items.some(
            (item) =>
              !Number.isInteger(item.quantity) || item.quantity < 1,
          )
        ) {
          fieldErrors.items =
            "Each item needs a quantity of at least 1.";
        }

        if (Object.keys(fieldErrors).length > 0) {
          throw new MockApiError("Please check the order details.", {
            status: 422,
            code: "VALIDATION_ERROR",
            fieldErrors,
          });
        }

        assertSlotAvailable(slot as MockDeliverySlot);

        const now = store.now;
        let customerCreated = false;
        if (!customer) {
          customer = {
            id: await deriveCustomerId(MOCK_HUB_ID, pendingPhone),
            hubId: MOCK_HUB_ID,
            name: pendingName,
            phone: pendingPhone,
            notes: null,
            createdAt: now,
            updatedAt: now,
          };
          store.customers.push(customer);
          customerCreated = true;
        }

        const orderId = `ORD-${store.nextOrderNumber}`;
        store.nextOrderNumber += 1;
        const orderItems = items.map((item) => ({
          id: `${orderId}-ITEM-${store.nextItemNumber++}`,
          description: item.description,
          quantity: item.quantity,
          serviceType: input.serviceType,
        }));
        const order: MockOrderRecord = {
          id: orderId,
          customerId: customer.id,
          customerName: customer.name,
          status: "confirmed",
          serviceType: input.serviceType,
          deliverySlotId: (slot as MockDeliverySlot).id,
          deliveryAt: (slot as MockDeliverySlot).startsAt,
          version: 1,
          holdComment: null,
          createdAt: now,
          updatedAt: now,
          cancelledAt: null,
          totalItems: orderItems.reduce(
            (total, item) => total + item.quantity,
            0,
          ),
          syncState: mutationOptions.online === false ? "pending" : "synced",
          lastError: null,
          items: orderItems,
        };

        store.orders.unshift(order);
        (slot as MockDeliverySlot).booked += 1;
        refreshSlot(slot as MockDeliverySlot, store.todayKey);

        return { ...orderDetail(store, order), customerCreated };
      });
    },

    applyOrderIntent(
      orderId: string,
      intent: MockOrderIntent,
      payload: unknown,
      baseVersion: number,
      mutationOptions: OrderMutationOptions = {},
    ): Promise<MockOrderDetail> {
      return withLatency(() =>
        applyOrderIntentSync(
          orderId,
          intent,
          payload,
          baseVersion,
          mutationOptions,
        ),
      );
    },

    updateOrder(
      orderId: string,
      input: UpdateOrderInput,
      mutationOptions: OrderMutationOptions = {},
    ): Promise<MockOrderDetail> {
      return withLatency(() => {
        const order = findOrder(store, orderId);
        if (input.customerNotes !== undefined) {
          const cust = store.customers.find((c) => c.id === order.customerId);
          if (cust) {
            cust.notes = input.customerNotes;
          } else {
            store.customers.push({
              id: order.customerId,
              hubId: MOCK_HUB_ID,
              name: order.customerName,
              phone: "",
              notes: input.customerNotes,
              createdAt: order.createdAt,
              updatedAt: store.now,
            });
          }
        }
        if (input.serviceType) {
          order.serviceType = input.serviceType;
        }
        if (input.status && input.status !== order.status) {
          let intent: MockOrderIntent = "markProcessing";
          let payload: unknown = {};
          if (input.status === "processing") intent = "markProcessing";
          else if (input.status === "out_for_delivery")
            intent = "markOutForDelivery";
          else if (input.status === "delivered") intent = "markDelivered";
          else if (input.status === "hold") {
            intent = "placeOnHold";
            payload = {
              comments: input.holdComment ?? input.comments ?? "Put on hold",
            };
          } else if (input.status === "confirmed" && order.status === "hold") {
            intent = "releaseHold";
          } else if (input.status === "cancelled") {
            intent = "cancel";
            payload = { reason: input.reason ?? "Cancelled" };
          }
          return applyOrderIntentSync(
            orderId,
            intent,
            payload,
            order.version,
            mutationOptions,
          );
        }
        if (
          input.deliverySlotId &&
          input.deliverySlotId !== order.deliverySlotId
        ) {
          return applyOrderIntentSync(
            orderId,
            "reschedule",
            { deliverySlotId: input.deliverySlotId },
            order.version,
            mutationOptions,
          );
        }
        return orderDetail(store, order);
      });
    },

    cancelOrder(
      orderId: string,
      reason?: string,
      mutationOptions: OrderMutationOptions = {},
    ): Promise<MockOrderDetail> {
      return withLatency(() => {
        const order = findOrder(store, orderId);
        return applyOrderIntentSync(
          orderId,
          "cancel",
          { reason: reason ?? "Cancelled by user" },
          order.version,
          mutationOptions,
        );
      });
    },
    getDeliverySchedule(date?: string): Promise<DeliverySchedule> {
      return withLatency(() => {
        const dateKey = date ?? store.todayKey;
        const slots = store.slots
          .filter((slot) => slot.localDate === dateKey)
          .map(cloneSlot);
        const slotIds = new Set(slots.map((slot) => slot.id));
        const orders = store.orders
          .filter(
            (order) =>
              order.deliverySlotId !== null &&
              slotIds.has(order.deliverySlotId) &&
              order.status !== "delivered" &&
              order.status !== "cancelled",
          )
          .sort(
            (left, right) =>
              (left.deliveryAt ?? 0) - (right.deliveryAt ?? 0),
          )
          .map(cloneSummary);
        const capacity = slots.reduce(
          (total, slot) => total + slot.capacity,
          0,
        );
        const booked = slots.reduce(
          (total, slot) => total + slot.booked,
          0,
        );

        return {
          date: dateKey,
          dateLabel: formatScheduleDate(dateKey),
          slots,
          orders,
          capacity,
          booked,
          available: Math.max(0, capacity - booked),
        };
      });
    },
    listCustomers(query: CustomerListQuery = {}): Promise<CustomerListResult> {
      return withLatency(() => {
        const search = (query.search ?? "").trim().toLowerCase();
        const pageSize = Math.min(Math.max(query.pageSize ?? 10, 1), 50);
        const filtered = store.customers
          .filter((customer) => {
            if (!search) {
              return true;
            }
            return (
              customer.name.toLowerCase().includes(search) ||
              customer.phone.replace(/\s/g, "").includes(search)
            );
          })
          .sort((left, right) => left.name.localeCompare(right.name));
        const page = paginate(filtered, query.page ?? 1, pageSize);
        return {
          items: page.items.map((customer) =>
            customerSummary(store, customer),
          ),
          total: filtered.length,
          page: page.page,
          pageSize,
          pageCount: page.pageCount,
        };
      });
    },
    getCustomer(customerId: string): Promise<MockCustomerDetail | null> {
      return withLatency(() => {
        const customer = store.customers.find(
          (entry) => entry.id === customerId,
        );
        if (!customer) {
          return null;
        }
        const orders = store.orders
          .filter((order) => order.customerId === customerId)
          .sort((left, right) => right.createdAt - left.createdAt)
          .map(cloneSummary);
        return { customer: { ...customer }, orders };
      });
    },

    listTenants(query = {}): Promise<TenantListResponse> {
      return withLatency(() => {
        let filtered = store.tenants.filter((tenant) => {
          if (query.status && tenant.status !== query.status) {
            return false;
          }
          if (!query.status && tenant.status === "deleted") {
            return false;
          }
          return true;
        });
        filtered.sort((a, b) => b.createdAt - a.createdAt);
        const limit = query.limit ?? 50;
        const items = filtered.slice(0, limit).map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          planTier: t.planTier,
          hubCount: 1,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));
        return {
          items,
          nextCursor: null,
        };
      });
    },

    getTenant(id: string): Promise<Tenant | null> {
      return withLatency(() => {
        const tenant = store.tenants.find((t) => t.id === id);
        return tenant ? { ...tenant } : null;
      });
    },

    createTenant(input: CreateTenantRequest): Promise<Tenant> {
      return withLatency(() => {
        const slug =
          input.slug ??
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        if (store.tenants.some((t) => t.slug === slug)) {
          throw new MockApiError(
            `Tenant with slug "${slug}" already exists`,
            { status: 409, code: "VALIDATION_ERROR" },
          );
        }
        const newTenant: Tenant = {
          id: `tenant-${Math.random().toString(36).substring(2, 10)}`,
          name: input.name,
          slug,
          status: "active",
          planTier: input.planTier ?? "standard",
          settings: input.settings ?? {},
          metadata: input.metadata ?? {},
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          version: 1,
          createdAt: store.now,
          updatedAt: store.now,
        };
        store.tenants.unshift(newTenant);
        return { ...newTenant };
      });
    },

    updateTenant(id: string, input: UpdateTenantRequest): Promise<Tenant> {
      return withLatency(() => {
        const tenant = store.tenants.find((t) => t.id === id);
        if (!tenant) {
          throw new MockApiError("Tenant not found", {
            status: 404,
            code: "NOT_FOUND",
          });
        }
        if (
          input.baseVersion !== undefined &&
          input.baseVersion !== tenant.version
        ) {
          throw new MockApiError(
            `Tenant was updated concurrently. Expected version ${input.baseVersion}, got ${tenant.version}`,
            { status: 409, code: "VERSION_CONFLICT" },
          );
        }
        if (input.slug && input.slug !== tenant.slug) {
          if (store.tenants.some((t) => t.id !== id && t.slug === input.slug)) {
            throw new MockApiError(
              `Tenant with slug "${input.slug}" already exists`,
              { status: 409, code: "VALIDATION_ERROR" },
            );
          }
          tenant.slug = input.slug;
        }
        if (input.name !== undefined) tenant.name = input.name;
        if (input.planTier !== undefined) tenant.planTier = input.planTier;
        if (input.status !== undefined) tenant.status = input.status;
        if (input.contactEmail !== undefined)
          tenant.contactEmail = input.contactEmail;
        if (input.contactPhone !== undefined)
          tenant.contactPhone = input.contactPhone;
        if (input.settings !== undefined) {
          tenant.settings = { ...tenant.settings, ...input.settings };
        }
        if (input.metadata !== undefined) {
          tenant.metadata = { ...tenant.metadata, ...input.metadata };
        }
        tenant.version += 1;
        tenant.updatedAt = store.now;
        return { ...tenant };
      });
    },

    deleteTenant(id: string): Promise<DeleteTenantResponse> {
      return withLatency(() => {
        const tenant = store.tenants.find((t) => t.id === id);
        if (!tenant) {
          throw new MockApiError("Tenant not found", {
            status: 404,
            code: "NOT_FOUND",
          });
        }
        tenant.status = "deleted";
        tenant.deletedAt = store.now;
        tenant.updatedAt = store.now;
        tenant.version += 1;
        return {
          id: tenant.id,
          status: "deleted" as const,
          deletedAt: store.now,
          message: "Tenant soft-deleted successfully",
        };
      });
    },

    listHubs(query?: {
      tenantId?: string;
      isActive?: boolean;
      limit?: number;
      cursor?: string | null;
    }): Promise<HubListResponse> {
      return withLatency(() => {
        let filtered = store.hubs.filter((h) => !h.deletedAt);
        if (query?.tenantId) {
          filtered = filtered.filter((h) => h.tenantId === query.tenantId);
        }
        if (query?.isActive !== undefined) {
          filtered = filtered.filter((h) => h.isActive === query.isActive);
        }
        const limit = query?.limit ?? 50;
        const items = filtered.slice(0, limit).map((h) => ({
          id: h.id,
          tenantId: h.tenantId,
          name: h.name,
          code: h.code,
          address: h.address,
          phone: h.phone,
          timezone: h.timezone,
          isActive: h.isActive,
          createdAt: h.createdAt,
          updatedAt: h.updatedAt,
        }));
        return {
          items,
          nextCursor: filtered.length > limit ? "next-cursor" : null,
        };
      });
    },

    getHub(id: string): Promise<Hub | null> {
      return withLatency(() => {
        const hub = store.hubs.find((h) => h.id === id && !h.deletedAt);
        return hub ? { ...hub } : null;
      });
    },

    createHub(input: CreateHubRequest): Promise<Hub> {
      return withLatency(() => {
        const code = input.code.toUpperCase().trim();
        const tenantId = input.tenantId ?? "tenant-freshfold-mumbai";
        if (
          store.hubs.some(
            (h) =>
              h.tenantId === tenantId &&
              h.code.toUpperCase() === code &&
              !h.deletedAt,
          )
        ) {
          throw new MockApiError(
            `Hub with code "${code}" already exists for this tenant`,
            { status: 409, code: "CODE_ALREADY_EXISTS" },
          );
        }
        const newHub: Hub = {
          id: `hub-${Math.random().toString(36).substring(2, 10)}`,
          tenantId,
          name: input.name.trim(),
          code,
          address: input.address ?? null,
          phone: input.phone ?? null,
          timezone: input.timezone ?? "Asia/Kolkata",
          isActive: input.isActive ?? true,
          settings: input.settings ?? {},
          metadata: input.metadata ?? {},
          version: 1,
          createdAt: store.now,
          updatedAt: store.now,
          deletedAt: null,
        };
        store.hubs.unshift(newHub);
        return { ...newHub };
      });
    },

    updateHub(id: string, input: UpdateHubRequest): Promise<Hub> {
      return withLatency(() => {
        const hub = store.hubs.find((h) => h.id === id && !h.deletedAt);
        if (!hub) {
          throw new MockApiError("Hub not found", {
            status: 404,
            code: "NOT_FOUND",
          });
        }
        if (
          input.baseVersion !== undefined &&
          input.baseVersion !== hub.version
        ) {
          throw new MockApiError(
            `Hub was updated concurrently. Expected version ${input.baseVersion}, got ${hub.version}`,
            { status: 409, code: "VERSION_CONFLICT" },
          );
        }
        if (input.code && input.code.toUpperCase() !== hub.code.toUpperCase()) {
          const codeUpper = input.code.toUpperCase().trim();
          if (
            store.hubs.some(
              (h) =>
                h.id !== id &&
                h.tenantId === hub.tenantId &&
                h.code.toUpperCase() === codeUpper &&
                !h.deletedAt,
            )
          ) {
            throw new MockApiError(
              `Hub with code "${codeUpper}" already exists for this tenant`,
              { status: 409, code: "CODE_ALREADY_EXISTS" },
            );
          }
          hub.code = codeUpper;
        }
        if (input.name !== undefined) hub.name = input.name.trim();
        if (input.address !== undefined) hub.address = input.address;
        if (input.phone !== undefined) hub.phone = input.phone;
        if (input.timezone !== undefined) hub.timezone = input.timezone;
        if (input.isActive !== undefined) hub.isActive = input.isActive;
        if (input.settings !== undefined) {
          hub.settings = { ...hub.settings, ...input.settings };
        }
        if (input.metadata !== undefined) {
          hub.metadata = { ...hub.metadata, ...input.metadata };
        }
        hub.version += 1;
        hub.updatedAt = store.now;
        return { ...hub };
      });
    },

    deleteHub(id: string): Promise<DeleteHubResponse> {
      return withLatency(() => {
        const hub = store.hubs.find((h) => h.id === id && !h.deletedAt);
        if (!hub) {
          throw new MockApiError("Hub not found", {
            status: 404,
            code: "NOT_FOUND",
          });
        }
        hub.isActive = false;
        hub.deletedAt = store.now;
        hub.updatedAt = store.now;
        hub.version += 1;
        return {
          id: hub.id,
          tenantId: hub.tenantId,
          status: "deleted" as const,
          deletedAt: store.now,
          message: "Hub soft-deleted successfully",
        };
      });
    },
  };
}
