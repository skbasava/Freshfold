import type {
  DeliverySlot,
  OrderStatus,
  OrderSummary,
} from "@laundry/contracts";
import { apiFetch } from "@/lib/http/api-client";
import type {
  DashboardFetchOptions,
  DashboardOrder,
  DashboardService,
  DashboardSlot,
  DashboardSnapshot,
} from "../types/dashboard.types";

function formatSlotLabel(slotId: string | null): string {
  if (!slotId) return "Unscheduled";
  const match = slotId.match(/^slot-\d{4}-\d{2}-\d{2}-(\d{2})(\d{2})$/);
  if (!match) return slotId;
  const startHour = Number(match[1]);
  const endHour = startHour + 2;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(startHour)}:${match[2]} – ${pad(endHour)}:${match[2]}`;
}

function mapOrders(items: unknown[]): DashboardOrder[] {
  return (items as Array<Record<string, unknown>>).map((order) => {
    const id = String(order.id);
    const crnId = (order.crnId as string) ?? (order.orderNumber as string) ?? `ORD-${id}`;
    const customerName =
      (order.customerName as string) ??
      (order.customerId ? `Customer #${order.customerId}` : "Customer");
    const serviceType =
      (order.serviceType as string) ??
      (order.primaryService as string) ??
      "Standard Laundry";
    const status = (order.status ?? "confirmed") as OrderStatus;
    const deliverySlotId =
      (order.deliverySlotId as string | null) ??
      (order.promisedDeliveryAt
        ? `slot-${String(order.promisedDeliveryAt).slice(0, 10)}`
        : null);
    const deliverySlotLabel =
      (order.deliverySlotLabel as string | undefined) ??
      formatSlotLabel(deliverySlotId);
    const holdComment =
      (order.holdComment as string | null) ??
      (order.specialInstructions as string | null) ??
      null;

    return {
      id,
      crnId,
      customerName,
      serviceType,
      status,
      deliverySlotId,
      deliverySlotLabel,
      holdComment,
    };
  });
}

function mapSlots(
  slotItems: unknown[],
  orders: DashboardOrder[],
): DashboardSlot[] {
  const items = slotItems as Array<Record<string, unknown>>;
  if (items.length === 0) {
    return [];
  }

  return items.map((slot) => {
    const id = String(slot.id);
    const capacity = typeof slot.capacity === "number" ? slot.capacity : 10;
    const booked =
      typeof slot.booked === "number"
        ? slot.booked
        : orders.filter(
            (order) =>
              order.deliverySlotId === id &&
              order.status !== "cancelled" &&
              order.status !== "delivered",
          ).length;

    return {
      id,
      label: (slot.label as string) ?? formatSlotLabel(id),
      booked,
      capacity,
    };
  });
}

export function createDashboardService(
  fetchImpl: typeof fetch = fetch,
): DashboardService {
  return {
    async fetchSnapshot({
      dateKey,
    }: DashboardFetchOptions): Promise<DashboardSnapshot> {
      const [ordersRes, slotsRes] = await Promise.all([
        apiFetch("/api/v1/orders?limit=50", { method: "GET", fetchImpl }).catch(() =>
          apiFetch("/api/orders?limit=50", { method: "GET", fetchImpl }),
        ),
        apiFetch(`/api/v1/deliveries/slots?date=${encodeURIComponent(dateKey)}`, {
          method: "GET",
          fetchImpl,
        }).catch(() =>
          apiFetch(`/api/delivery-slots?date=${encodeURIComponent(dateKey)}`, {
            method: "GET",
            fetchImpl,
          }),
        ),
      ]);

      if (!ordersRes.ok) {
        throw new Error(
          `Unable to load orders (HTTP ${ordersRes.status}). Please retry.`,
        );
      }

      const ordersRaw = (await ordersRes.json()) as {
        data?: { items?: unknown[] };
        items?: unknown[];
      };
      const orderItems = ordersRaw?.data?.items ?? ordersRaw?.items ?? [];

      let slotItems: unknown[] = [];
      if (slotsRes.ok) {
        const slotsRaw = (await slotsRes.json()) as {
          data?: { items?: unknown[] } | unknown[];
          items?: unknown[];
        };
        slotItems =
          (Array.isArray(slotsRaw?.data)
            ? slotsRaw.data
            : slotsRaw?.data?.items) ??
          slotsRaw?.items ??
          [];
      }

      const orders = mapOrders(orderItems);
      const slots = mapSlots(slotItems, orders);

      return { orders, slots };
    },
  };
}

export const defaultDashboardService: DashboardService =
  createDashboardService();
