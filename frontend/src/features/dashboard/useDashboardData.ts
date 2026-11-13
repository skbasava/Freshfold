import { useEffect, useState } from "react";
import type { AppApi } from "../../api/types";
import { formatToday, localDateKey } from "../../lib/format";
import { listOrdersForDate } from "../../lib/orders-for-date";
import type { DashboardData, MockOrderSummary } from "../../mocks/types";

export type DashboardLoadState =
  | { status: "loading" }
  | {
      status: "success";
      data: DashboardData;
      today: number;
      todayOrders: MockOrderSummary[];
      deliveriesError: boolean;
    }
  | { status: "error" };

export interface UseDashboardDataResult {
  state: DashboardLoadState;
  todayLabel: string;
  pendingCount: number;
  conflictCount: number;
  reload: () => void;
}

export function useDashboardData(client: AppApi): UseDashboardDataResult {
  const [state, setState] = useState<DashboardLoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    Promise.all([client.getDashboardData(), client.getSession()])
      .then(async ([data, session]) => {
        let todayOrders: MockOrderSummary[] = [];
        let deliveriesError = false;

        try {
          todayOrders = await listOrdersForDate(
            client,
            localDateKey(session.today),
          );
        } catch {
          deliveriesError = true;
        }

        if (!cancelled) {
          setState({
            status: "success",
            data,
            today: session.today,
            todayOrders,
            deliveriesError,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, reloadToken]);

  const success = state.status === "success" ? state : null;
  const data = success?.data ?? null;
  const todayLabel = success
    ? formatToday(new Date(success.today))
    : formatToday();
  const pendingCount =
    data?.recentOrders.filter((order) => order.syncState === "pending").length ??
    0;
  const conflictCount =
    data?.recentOrders.filter((order) => order.syncState === "conflict").length ??
    0;

  return {
    state,
    todayLabel,
    pendingCount,
    conflictCount,
    reload: () => setReloadToken((token) => token + 1),
  };
}

