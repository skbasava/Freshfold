import {
  Alert,
  Button,
  LoadingState,
  PageContainer,
  Toast,
} from "@freshfold/ui";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOptionalApi } from "../../api/context";
import type { AppApi } from "../../api/types";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import type { MockOrderIntent, MockOrderSummary } from "../../mocks/types";
import {
  AttentionQueueCard,
  CalendarSectionCard,
  DashboardHeader,
  SummaryGrid,
  SyncBanner,
  TodayDeliveriesCard,
} from "./components";
import { useDashboardData } from "./useDashboardData";

export interface DashboardProps {
  api?: AppApi;
  online?: boolean;
}

export function Dashboard({ api, online }: DashboardProps) {
  const detectedOnline = useOnlineStatus();
  const isOnline = online ?? detectedOnline;
  const navigate = useNavigate();
  const contextApi = useOptionalApi();
  const client = api ?? contextApi;
  if (!client) {
    throw new Error(
      "Dashboard must be rendered within an ApiProvider or supplied with an api prop",
    );
  }
  const { state, todayLabel, pendingCount, conflictCount, reload } =
    useDashboardData(client);

  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const success = state.status === "success" ? state : null;
  const data = success?.data ?? null;
  const hasAttention = Boolean(data && data.attention.length > 0);
  const allSaved = isOnline && pendingCount === 0 && conflictCount === 0;

  const handleAdvanceStatus = async (
    order: MockOrderSummary,
    intent: MockOrderIntent,
  ) => {
    setBusyOrderId(order.id);
    setActionNotice(null);
    setActionError(null);

    try {
      const updated = await client.applyOrderIntent(
        order.id,
        intent,
        {},
        order.version,
        { online: isOnline },
      );
      setActionNotice(
        updated.syncState === "pending"
          ? `Saved update for ${order.customerName} on this device.`
          : `Updated ${order.customerName} (#${order.id}).`,
      );
      reload();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not update that order right now.",
      );
    } finally {
      setBusyOrderId(null);
    }
  };

  return (
    <PageContainer className="flex flex-col gap-7">
      <DashboardHeader
        dateLabel={todayLabel}
        summary={data?.summary}
        allSaved={Boolean(data && allSaved)}
        onNewOrder={() => navigate("/orders/new")}
        onScheduleDelivery={() => navigate("/deliveries")}
        onFindCustomer={() => navigate("/customers")}
        onViewOrders={() => navigate("/orders")}
      />

      {actionNotice ? (
        <Toast
          tone="success"
          title={actionNotice}
          onDismiss={() => setActionNotice(null)}
        />
      ) : null}

      {actionError ? (
        <Alert tone="danger" title="Could not update order">
          {actionError}
        </Alert>
      ) : null}

      {state.status === "loading" ? (
        <LoadingState
          label="Loading today's orders"
          variant="cards"
          rows={4}
        />
      ) : null}

      {state.status === "error" ? (
        <Alert
          tone="danger"
          title="We could not load the dashboard"
          action={
            <Button variant="secondary" size="sm" onClick={reload}>
              Try again
            </Button>
          }
        >
          Check your connection and try again. Any changes already saved on this
          device are safe.
        </Alert>
      ) : null}

      {data && success ? (
        <>
          <SyncBanner
            online={isOnline}
            pendingCount={pendingCount}
            conflictCount={conflictCount}
            onReview={() => navigate("/orders")}
          />

          <SummaryGrid
            summary={data.summary}
            onNavigate={(path) => navigate(path)}
          />

          <div className="grid gap-6 xl:grid-cols-12 xl:items-start">
            <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
              {hasAttention ? (
                <>
                  <AttentionQueueCard
                    items={data.attention}
                    onOpen={(href) => navigate(href)}
                  />
                  <TodayDeliveriesCard
                    orders={success.todayOrders}
                    todayLabel={todayLabel}
                    error={success.deliveriesError}
                    busyOrderId={busyOrderId}
                    onAdvanceStatus={(order, intent) =>
                      void handleAdvanceStatus(order, intent)
                    }
                    onRetry={reload}
                    onOpenCalendar={() => navigate("/calendar")}
                  />
                </>
              ) : (
                <>
                  <TodayDeliveriesCard
                    orders={success.todayOrders}
                    todayLabel={todayLabel}
                    error={success.deliveriesError}
                    busyOrderId={busyOrderId}
                    onAdvanceStatus={(order, intent) =>
                      void handleAdvanceStatus(order, intent)
                    }
                    onRetry={reload}
                    onOpenCalendar={() => navigate("/calendar")}
                  />
                  <AttentionQueueCard
                    items={data.attention}
                    onOpen={(href) => navigate(href)}
                  />
                </>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-6 xl:col-span-4">
              <CalendarSectionCard
                onOpenFullCalendar={() => navigate("/calendar")}
              />
            </div>
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}
