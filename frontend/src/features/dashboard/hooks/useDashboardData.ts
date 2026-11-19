import { useCallback, useEffect, useMemo, useState } from "react";
import { getOffsetDateKey } from "@/lib/date";
import { defaultDashboardService } from "../services/dashboard.service";
import type {
  DashboardKpiSummary,
  DashboardOrder,
  DashboardOrderFilter,
  DashboardService,
  DashboardSlot,
  DashboardSlotDay,
} from "../types/dashboard.types";

export interface UseDashboardDataOptions {
  searchQuery?: string;
  service?: DashboardService;
}

export interface UseDashboardDataReturn {
  orders: DashboardOrder[];
  filteredOrders: DashboardOrder[];
  slots: DashboardSlot[];
  summary: DashboardKpiSummary;
  filter: DashboardOrderFilter;
  slotDay: DashboardSlotDay;
  loading: boolean;
  error: string | null;
  setFilter: (filter: DashboardOrderFilter) => void;
  setSlotDay: (day: DashboardSlotDay) => void;
  refresh: () => Promise<void>;
}

export function useDashboardData({
  searchQuery = "",
  service = defaultDashboardService,
}: UseDashboardDataOptions = {}): UseDashboardDataReturn {
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [slots, setSlots] = useState<DashboardSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DashboardOrderFilter>("all");
  const [slotDay, setSlotDay] = useState<DashboardSlotDay>("today");

  const dateKey = useMemo(
    () => getOffsetDateKey(slotDay === "tomorrow" ? 1 : 0),
    [slotDay],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await service.fetchSnapshot({ dateKey });
      setOrders(snapshot.orders);
      setSlots(snapshot.slots);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load live hub data. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [dateKey, service]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo<DashboardKpiSummary>(() => {
    let confirmed = 0;
    let processing = 0;
    let outForDelivery = 0;
    let onHold = 0;
    let deliveredToday = 0;
    let totalActive = 0;

    for (const order of orders) {
      if (order.status === "delivered") {
        deliveredToday += 1;
        continue;
      }
      if (order.status === "cancelled") {
        continue;
      }
      totalActive += 1;
      if (order.status === "confirmed") confirmed += 1;
      if (order.status === "processing") processing += 1;
      if (order.status === "out_for_delivery") outForDelivery += 1;
      if (order.status === "hold") onHold += 1;
    }

    return {
      totalActive,
      confirmed,
      processing,
      outForDelivery,
      onHold,
      deliveredToday,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return orders.filter((order) => {
      if (filter !== "all" && order.status !== filter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        order.customerName.toLowerCase().includes(query) ||
        order.crnId.toLowerCase().includes(query) ||
        order.serviceType.toLowerCase().includes(query)
      );
    });
  }, [filter, orders, searchQuery]);

  return {
    orders,
    filteredOrders,
    slots,
    summary,
    filter,
    slotDay,
    loading,
    error,
    setFilter,
    setSlotDay,
    refresh: load,
  };
}
