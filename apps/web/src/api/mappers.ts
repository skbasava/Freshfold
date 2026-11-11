import type {
  Customer,
  OrderDetail,
  OrderSummary,
} from "@laundry/contracts";
import { formatDeliveryTime, localDateKey } from "../lib/format";
import type {
  MockCustomerSummary,
  MockDeliverySlot,
  MockOrderDetail,
  MockOrderItem,
  MockOrderSummary,
} from "../mocks/types";
import type {
  LocalOrder,
  LocalOrderSyncState,
  PendingMutation,
} from "../sync/types";

export function deliverySlotFromOrder(
  order: Pick<OrderSummary, "deliverySlotId" | "deliveryAt">,
): MockDeliverySlot | null {
  if (!order.deliverySlotId || order.deliveryAt === null) {
    return null;
  }
  const startsAt = order.deliveryAt;
  const endsAt = startsAt + 2 * 60 * 60 * 1000;
  return {
    id: order.deliverySlotId,
    label: `${formatDeliveryTime(startsAt)} – ${formatDeliveryTime(endsAt)}`,
    startsAt,
    endsAt,
    capacity: 1,
    booked: 0,
    available: 1,
    localDate: localDateKey(startsAt),
    status: "open",
    closedReason: null,
  };
}

export function orderSummaryToMock(
  order: OrderSummary,
  options: {
    totalItems?: number;
    syncState?: LocalOrderSyncState;
    lastError?: string | null;
  } = {},
): MockOrderSummary {
  return {
    id: order.id,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    status: order.status,
    serviceType: order.serviceType,
    deliverySlotId: order.deliverySlotId,
    deliveryAt: order.deliveryAt,
    version: order.version,
    holdComment: order.holdComment,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    cancelledAt: order.cancelledAt,
    totalItems: options.totalItems ?? 0,
    syncState: options.syncState ?? "synced",
    lastError: options.lastError ?? null,
  };
}

export function orderDetailToMock(
  order: OrderDetail,
  options: {
    syncState?: LocalOrderSyncState;
    lastError?: string | null;
  } = {},
): MockOrderDetail {
  const items: MockOrderItem[] = order.items.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    serviceType: item.serviceType,
  }));

  return {
    ...orderSummaryToMock(order, {
      totalItems: items.reduce((total, item) => total + item.quantity, 0),
      syncState: options.syncState ?? "synced",
      lastError: options.lastError ?? null,
    }),
    customer: order.customer,
    items,
    deliverySlot: deliverySlotFromOrder(order),
  };
}

export function mergeLocalOrderIntoDetail(
  detail: MockOrderDetail,
  local: LocalOrder,
): MockOrderDetail {
  return {
    ...detail,
    status: local.status,
    serviceType: local.serviceType,
    deliverySlotId: local.deliverySlotId,
    deliveryAt: local.deliveryAt,
    version: local.version,
    holdComment: local.holdComment,
    updatedAt: local.updatedAt,
    cancelledAt: local.cancelledAt ?? detail.cancelledAt,
    syncState: local.syncState,
    lastError: local.lastError ?? null,
    deliverySlot: deliverySlotFromOrder(local),
  };
}

function itemsFromCreateMutation(
  mutations: PendingMutation[],
  orderId: string,
): MockOrderItem[] {
  const create = mutations
    .filter(
      (mutation) =>
        mutation.orderId === orderId && mutation.intent === "createOrder",
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  if (!create || create.payload === null || typeof create.payload !== "object") {
    return [];
  }
  const payload = create.payload as {
    items?: Array<{
      description?: unknown;
      quantity?: unknown;
      serviceType?: unknown;
    }>;
  };
  if (!Array.isArray(payload.items)) {
    return [];
  }
  return payload.items.flatMap((item, index) => {
    if (
      typeof item.description !== "string" ||
      typeof item.quantity !== "number"
    ) {
      return [];
    }
    return [
      {
        id: `${orderId}:item:${index}`,
        description: item.description,
        quantity: item.quantity,
        serviceType:
          typeof item.serviceType === "string" ? item.serviceType : null,
      },
    ];
  });
}

export function localOrderToMockDetail(
  order: LocalOrder,
  mutations: PendingMutation[],
  customer?: Customer,
): MockOrderDetail {
  const items = itemsFromCreateMutation(mutations, order.id);
  const customerRecord: Customer =
    customer ?? {
      id: order.customerId,
      hubId: order.hubId,
      name: order.customerName,
      phone: order.customerPhone,
      notes: null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };

  return {
    id: order.id,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    status: order.status,
    serviceType: order.serviceType,
    deliverySlotId: order.deliverySlotId,
    deliveryAt: order.deliveryAt,
    version: order.version,
    holdComment: order.holdComment,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    cancelledAt: order.cancelledAt ?? null,
    totalItems: items.reduce((total, item) => total + item.quantity, 0),
    syncState: order.syncState,
    lastError: order.lastError ?? null,
    customer: customerRecord,
    items,
    deliverySlot: deliverySlotFromOrder(order),
  };
}

export function customerSummaryFromOrders(
  customer: Customer,
  orders: Array<Pick<OrderSummary, "customerId" | "createdAt">>,
): MockCustomerSummary {
  const customerOrders = orders.filter(
    (order) => order.customerId === customer.id,
  );
  return {
    ...customer,
    orderCount: customerOrders.length,
    lastOrderAt:
      customerOrders.length === 0
        ? null
        : Math.max(...customerOrders.map((order) => order.createdAt)),
  };
}
