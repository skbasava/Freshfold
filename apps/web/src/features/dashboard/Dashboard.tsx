import {
  Alert,
  AlertTriangleIcon,
  Badge,
  Button,
  CalendarIcon,
  Card,
  CheckCircleIcon,
  EmptyState,
  LoadingState,
  PageContainer,
  PageHeader,
  PlusIcon,
  SearchIcon,
  StatusBadge,
  TruckIcon,
  XCircleIcon,
} from "@freshfold/ui";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useOptionalApi } from "../../api/context";
import type { AppApi } from "../../api/types";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import {
  formatDeliveryTime,
  formatToday,
  localDateKey,
} from "../../lib/format";
import { listOrdersForDate } from "../../lib/orders-for-date";
import { createMockApi } from "../../mocks/api";
import type {
  AttentionItem,
  DashboardData,
  DashboardSummary,
  MockOrderSummary,
} from "../../mocks/types";
import { GoogleCalendarWidget } from "../calendar/GoogleCalendarWidget";
import { SyncBanner } from "./SyncBanner";

const defaultApi = createMockApi();

interface DashboardProps {
  api?: AppApi;
  online?: boolean;
}

type LoadState =
  | { status: "loading" }
  | {
      status: "success";
      data: DashboardData;
      today: number;
      todayOrders: MockOrderSummary[];
      deliveriesError: boolean;
    }
  | { status: "error" };

const summaryToneClasses = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

interface SummaryTileProps {
  label: string;
  value: number;
  hint: string;
  tone: keyof typeof summaryToneClasses;
}

function SummaryTile({ label, value, hint, tone }: SummaryTileProps) {
  return (
    <Card padding="md" className="relative">
      <span
        aria-hidden="true"
        className={`mb-4 block h-1 w-9 rounded-full ${summaryToneClasses[tone]}`}
      />
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-text">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-text-muted">{hint}</p>
    </Card>
  );
}

function SummaryGrid({ summary }: { summary: DashboardSummary }) {
  return (
    <section aria-label="Today's summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryTile
        label="Orders today"
        value={summary.ordersToday}
        hint="New orders at this hub"
        tone="primary"
      />
      <SummaryTile
        label="Ready for delivery"
        value={summary.readyForDelivery}
        hint="Packed and waiting"
        tone="success"
      />
      <SummaryTile
        label="Out for delivery"
        value={summary.outForDelivery}
        hint="With the delivery team"
        tone="primary"
      />
      <SummaryTile
        label="Needs attention"
        value={summary.needsAttention}
        hint="Hold, late or conflicting"
        tone="warning"
      />
    </section>
  );
}

interface AttentionListProps {
  items: AttentionItem[];
  onOpen: (href: string) => void;
}

function AttentionList({ items, onOpen }: AttentionListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        compact
        icon={<CheckCircleIcon className="h-5 w-5" />}
        title="No orders need attention"
        description="You're all caught up. New issues will appear here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const Icon = item.tone === "danger" ? XCircleIcon : AlertTriangleIcon;
        return (
          <li
            key={item.id}
            className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md ${
                  item.tone === "danger"
                    ? "bg-danger/10 text-danger"
                    : "bg-warning/10 text-warning"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.status} />
                  <span className="text-sm font-semibold text-text">
                    {item.customerName}
                  </span>
                  <span className="text-xs text-text-muted">
                    {item.orderId}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  {item.reason}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpen(item.href)}
            >
              {item.actionLabel}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

interface TodayDeliveriesProps {
  orders: MockOrderSummary[];
  label: string;
}

function TodayDeliveries({ orders, label }: TodayDeliveriesProps) {
  if (orders.length === 0) {
    return (
      <EmptyState
        compact
        icon={<TruckIcon className="h-5 w-5" />}
        title="No deliveries today"
        description="Orders scheduled for today will appear here."
      />
    );
  }

  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {orders.map((order) => (
        <li
          key={order.id}
          className="rounded-md border border-border p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link
              to={`/orders/${order.id}`}
              className="font-semibold text-primary-strong underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {order.customerName}
            </Link>
            <span className="whitespace-nowrap text-xs font-semibold text-text">
              {order.deliveryAt
                ? formatDeliveryTime(order.deliveryAt)
                : "Not set"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            {order.syncState !== "synced" ? (
              <StatusBadge status={order.syncState} />
            ) : null}
            <span className="text-xs text-text-muted">{order.serviceType}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Dashboard({ api, online }: DashboardProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const detectedOnline = useOnlineStatus();
  const isOnline = online ?? detectedOnline;
  const navigate = useNavigate();
  const contextApi = useOptionalApi();
  const client = api ?? contextApi ?? defaultApi;

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
  const todayOrders = success?.todayOrders ?? [];
  const todayLabel = success
    ? formatToday(new Date(success.today))
    : formatToday();
  const pendingCount =
    data?.recentOrders.filter((order) => order.syncState === "pending").length ??
    0;
  const conflictCount =
    data?.recentOrders.filter((order) => order.syncState === "conflict").length ??
    0;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Front desk"
        title="Today at FreshFold"
        description={`${formatToday()} · A simple view of what needs your attention.`}
        actions={
          <Button
            leadingIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => navigate("/orders/new")}
          >
            New order
          </Button>
        }
      />

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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReloadToken((token) => token + 1)}
            >
              Try again
            </Button>
          }
        >
          Check your connection and try again. Any changes already saved on this
          device are safe.
        </Alert>
      ) : null}

      {data ? (
        <>
          <SyncBanner
            online={isOnline}
            pendingCount={pendingCount}
            conflictCount={conflictCount}
            onReview={() => navigate("/orders")}
          />

          <SummaryGrid summary={data.summary} />

          <Card
            title="Google Calendar"
            description="The hub's shared schedule. Front desk access is view only."
          >
            <GoogleCalendarWidget />
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <Card
                title="Needs attention"
                description="Orders that may need a quick check."
                actions={
                  <Badge tone={data.attention.length > 0 ? "warning" : "success"} dot>
                    {data.attention.length}
                  </Badge>
                }
              >
                <AttentionList
                  items={data.attention}
                  onOpen={(href) => navigate(href)}
                />
              </Card>

            </div>

            <div className="flex min-w-0 flex-col gap-6">
              <Card
                title={`Deliveries on ${todayLabel}`}
                description="Orders due today, earliest first."
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate("/calendar")}
                  >
                    Open calendar
                  </Button>
                }
              >
                {success?.deliveriesError ? (
                  <Alert
                    tone="warning"
                    title="Deliveries could not load"
                    action={
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setReloadToken((token) => token + 1)}
                      >
                        Try again
                      </Button>
                    }
                  >
                    The calendar still works. Try again in a moment.
                  </Alert>
                ) : (
                  <TodayDeliveries
                    orders={todayOrders}
                    label={`Deliveries on ${todayLabel}`}
                  />
                )}
              </Card>

              <Card
                title="Quick actions"
                description="Start the most common desk tasks."
              >
                <div className="flex flex-col gap-2">
                  <Button
                    fullWidth
                    leadingIcon={<PlusIcon className="h-4 w-4" />}
                    onClick={() => navigate("/orders/new")}
                  >
                    New order
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth
                    leadingIcon={<CalendarIcon className="h-4 w-4" />}
                    onClick={() => navigate("/deliveries")}
                  >
                    Schedule delivery
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth
                    leadingIcon={<SearchIcon className="h-4 w-4" />}
                    onClick={() => navigate("/customers")}
                  >
                    Find customer
                  </Button>
                </div>
              </Card>

            </div>
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}
