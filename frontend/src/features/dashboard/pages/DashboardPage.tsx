import { AlertCircle, RefreshCw } from "lucide-react";
import { useWorkspaceSearch } from "@/components/blocks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useOptionalAuth } from "@/features/auth";
import {
  DashboardHeaderBlock,
  DashboardKpiRow,
  OrdersQueueCard,
} from "../components";
import { useDashboardData } from "../hooks/useDashboardData";
import type { DashboardService } from "../types/dashboard.types";
import "../styles/dashboard.css";

export interface DashboardPageProps {
  dashboardService?: DashboardService;
}

export function DashboardPage({ dashboardService }: DashboardPageProps = {}) {
  const auth = useOptionalAuth();
  const outletContext = useWorkspaceSearch();
  const searchQuery = outletContext?.searchQuery ?? "";
  const setSearchQuery = outletContext?.setSearchQuery ?? (() => {});
  const hubName = auth?.session?.user.hubName ?? "Main Hub";
  const userName = auth?.session?.user.displayName ?? "Team";

  const {
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
    refresh,
  } = useDashboardData({
    searchQuery,
    service: dashboardService,
  });

  return (
    <div className="ff-dashboard">
      <DashboardHeaderBlock
        userName={userName}
        hubName={hubName}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Could not load realtime hub data</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              className="ff-touch-target"
              onClick={() => void refresh()}
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              <span>Retry</span>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <DashboardKpiRow summary={summary} loading={loading} />

      <OrdersQueueCard
        orders={filteredOrders}
        totalCount={orders.length}
        summary={summary}
        filter={filter}
        loading={loading}
        onFilterChange={setFilter}
      />
    </div>
  );
}
