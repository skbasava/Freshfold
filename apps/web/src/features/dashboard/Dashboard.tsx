import {
  Alert,
  AlertTriangleIcon,
  Badge,
  Button,
  CalendarIcon,
  Card,
  DataTable,
  EmptyState,
  LoadingState,
  PageContainer,
  PageHeader,
  PlusIcon,
  SearchIcon,
  StatusBadge,
  XCircleIcon,
  type DataTableColumn,
} from "@freshfold/ui";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOptionalApi } from "../../api/context";
import type { AppApi } from "../../api/types";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { formatDeliveryTime, formatToday } from "../../lib/format";
import { createMockApi } from "../../mocks/api";
import type {
  AttentionItem,
  DashboardData,
  DashboardOrder,
  DashboardSummary,
  DeliverySlotSummary,
} from "../../mocks/types";
import { SyncBanner } from "./SyncBanner";

const defaultApi = createMockApi();

interface DashboardProps {
  api?: AppApi;
  online?: boolean;
}

type LoadState =
  | { status: "loading" }
  | { status: "success"; data: DashboardData }
  | { status: "error" };

const orderColumns: DataTableColumn<DashboardOrder>[] = [
  {
    key: "order",
    header: "Order",
    render: (order) => (
      <div className="min-w-32">
        <p className="font-semibold text-text">{order.id}</p>
        <p className="text-xs text-text-muted">{order.serviceType}</p>
      </div>
    ),
  },
  {
    key: "customer",
    header: "Customer",
    render: (order) => (
      <div className="min-w-32">
        <p className="font-medium text-text">{order.customerName}</p>
        <p className="text-xs text-text-muted">
          {order.totalItems} item{order.totalItems === 1 ? "" : "s"}
        </p>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (order) => <StatusBadge status={order.status} />,
  },
  {
    key: "delivery",
    header: "Delivery",
    render: (order) => (
      <span className="whitespace-nowrap text-sm text-text">
        {order.deliveryAt ? formatDeliveryTime(order.deliveryAt) : "Not set"}
      </span>
    ),
  },
  {
    key: "sync",
    header: "Saved",
    render: (order) =>
      order.syncState === "synced" ? (
        <Badge tone="success" dot>
          Saved
        </Badge>
      ) : (
        <StatusBadge status={order.syncState} />
      ),
  },
];

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

interface DeliverySlotsProps {
  slots: DeliverySlotSummary[];
  capacityUsed: number;
  capacityTotal: number;
  unavailable?: boolean;
}

function DeliverySlots({
  slots,
  capacityUsed,
  capacityTotal,
  unavailable = false,
}: DeliverySlotsProps) {
  if (slots.length === 0) {
    return (
      <EmptyState
        title="No delivery slots"
        description={
          unavailable
            ? "Delivery times are not available from the server yet."
            : "Slots will appear when today's schedule is ready."
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {slots.map((slot) => {
        const percent = Math.round((slot.booked / slot.capacity) * 100);
        return (
          <li key={slot.id}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-text">{slot.label}</span>
              <span className="text-xs text-text-muted">
                {slot.available} of {slot.capacity} free
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${slot.label} booked`}
              aria-valuemin={0}
              aria-valuemax={slot.capacity}
              aria-valuenow={slot.booked}
              className="mt-2 h-2 overflow-hidden rounded-full bg-canvas"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${percent}%` }}
              />
            </div>
          </li>
        );
      })}
      <li className="border-t border-border pt-3 text-xs text-text-muted">
        {capacityUsed} of {capacityTotal} delivery places booked today.
      </li>
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

    client
      .getDashboardData()
      .then((data) => {
        if (!cancelled) {
          setState({ status: "success", data });
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

  const data = state.status === "success" ? state.data : null;
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
        <LoadingState label="Loading today's orders" rows={4} />
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

              <Card
                title="Recent orders"
                description="The latest orders from the front desk."
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate("/orders")}
                  >
                    View all
                  </Button>
                }
                padding="none"
              >
                <DataTable
                  caption="Recent orders"
                  columns={orderColumns}
                  rows={data.recentOrders}
                  getRowKey={(order) => order.id}
                  emptyState={
                    <EmptyState
                      title="No recent orders"
                      description="New orders will appear here as they come in."
                    />
                  }
                  className="rounded-none border-0"
                />
              </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
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

              <Card
                title="Today's delivery slots"
                description="Availability at a glance."
                actions={
                  <Badge tone="primary">
                    {data.summary.capacityUsed} / {data.summary.capacityTotal}
                  </Badge>
                }
              >
                <DeliverySlots
                  slots={data.deliverySlots}
                  capacityUsed={data.summary.capacityUsed}
                  capacityTotal={data.summary.capacityTotal}
                  unavailable={
                    client.capabilities.deliverySlots === "unavailable"
                  }
                />
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}
