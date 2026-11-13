import {
  Alert,
  ArrowRightIcon,
  Badge,
  Button,
  EmptyState,
  SearchIcon,
  StatusBadge,
  TruckIcon,
} from "@freshfold/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDeliveryTime } from "../../../lib/format";
import type { MockOrderIntent, MockOrderSummary } from "../../../mocks/types";

export interface TodayDeliveriesCardProps {
  orders: MockOrderSummary[];
  todayLabel: string;
  error?: boolean;
  busyOrderId?: string | null;
  onAdvanceStatus?: (order: MockOrderSummary, intent: MockOrderIntent) => void;
  onRetry: () => void;
  onOpenCalendar: () => void;
}

type DeliveryFilter = "all" | "active" | "done";

function nextStageAction(
  status: MockOrderSummary["status"],
): { intent: MockOrderIntent; label: string } | null {
  switch (status) {
    case "confirmed":
      return { intent: "markProcessing", label: "Start washing" };
    case "processing":
      return { intent: "markOutForDelivery", label: "Send for delivery" };
    case "out_for_delivery":
      return { intent: "markDelivered", label: "Mark delivered" };
    default:
      return null;
  }
}

export function TodayDeliveriesCard({
  orders,
  todayLabel,
  error = false,
  busyOrderId = null,
  onAdvanceStatus,
  onRetry,
  onOpenCalendar,
}: TodayDeliveriesCardProps) {
  const [filter, setFilter] = useState<DeliveryFilter>("all");
  const [query, setQuery] = useState("");
  const label = `Deliveries on ${todayLabel}`;

  const normalizedQuery = query.trim().toLowerCase();
  const visibleOrders = orders.filter((order) => {
    if (
      filter === "done" &&
      order.status !== "delivered" &&
      order.status !== "cancelled"
    ) {
      return false;
    }
    if (
      filter === "active" &&
      (order.status === "delivered" || order.status === "cancelled")
    ) {
      return false;
    }
    if (normalizedQuery) {
      return (
        order.customerName.toLowerCase().includes(normalizedQuery) ||
        order.id.toLowerCase().includes(normalizedQuery) ||
        order.serviceType.toLowerCase().includes(normalizedQuery)
      );
    }
    return true;
  });

  return (
    <section
      aria-labelledby="today-deliveries-heading"
      className="overflow-hidden rounded-lg border border-border/80 bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2
              id="today-deliveries-heading"
              className="text-base font-semibold tracking-tight text-text"
            >
              {label}
            </h2>
            <Badge tone="neutral">{orders.length} scheduled</Badge>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Timeline for today, sorted earliest first. Click a customer or update
            progress inline.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={onOpenCalendar}>
          Open calendar
        </Button>
      </div>

      {error ? (
        <div className="p-5 sm:p-6">
          <Alert
            tone="warning"
            title="Deliveries could not load"
            action={
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            }
          >
            The calendar still works. Try again in a moment.
          </Alert>
        </div>
      ) : orders.length === 0 ? (
        <div className="p-5 sm:p-6">
          <EmptyState
            compact
            icon={<TruckIcon className="h-5 w-5" />}
            title="No deliveries today"
            description="Orders scheduled for today will appear here."
          />
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-canvas/50 px-5 py-3 sm:px-6">
            <div
              role="group"
              aria-label="Filter today's deliveries"
              className="inline-flex rounded-full border border-border bg-surface p-0.5"
            >
              {(
                [
                  { id: "all", label: "All" },
                  { id: "active", label: "Active" },
                  { id: "done", label: "Completed" },
                ] as const
              ).map((option) => {
                const selected = filter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFilter(option.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      selected
                        ? "bg-primary text-surface"
                        : "text-text-muted hover:text-text"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="relative w-full sm:w-56">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Filter today's deliveries by customer or order"
                placeholder="Filter customer or order..."
                className="h-8 w-full rounded-full border border-border bg-surface pr-3 pl-8 text-xs text-text placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>

          {visibleOrders.length === 0 ? (
            <div className="p-5 sm:p-6">
              <EmptyState
                compact
                icon={<TruckIcon className="h-5 w-5" />}
                title="No matching deliveries"
                description="Clear your search or switch back to see all scheduled deliveries."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setFilter("all");
                      setQuery("");
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            </div>
          ) : (
            <ul aria-label={label} className="divide-y divide-border/60">
              {visibleOrders.map((order, index) => {
                const isLast = index === visibleOrders.length - 1;
                const dotColor =
                  order.status === "delivered"
                    ? "bg-success ring-success/20"
                    : order.status === "out_for_delivery"
                      ? "bg-accent ring-accent/20"
                      : order.status === "processing"
                        ? "bg-info ring-info/20"
                        : order.status === "hold"
                          ? "bg-warning ring-warning/20"
                          : "bg-text-muted/40 ring-border";

                const stageAction =
                  onAdvanceStatus && order.syncState === "synced"
                    ? nextStageAction(order.status)
                    : null;
                const isBusy = busyOrderId === order.id;

                return (
                  <li
                    key={order.id}
                    className="group relative flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-canvas/60 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <div className="flex min-w-0 items-start gap-4 sm:items-center">
                      <div className="relative flex w-20 shrink-0 items-center gap-2.5">
                        {!isLast ? (
                          <span
                            aria-hidden="true"
                            className="absolute top-5 left-[4px] -bottom-7 w-px bg-border/80 hidden sm:block"
                          />
                        ) : null}
                        <span
                          aria-hidden="true"
                          className={`relative z-10 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${dotColor}`}
                        />
                        <span className="text-xs font-semibold whitespace-nowrap tabular-nums text-text">
                          {order.deliveryAt
                            ? formatDeliveryTime(order.deliveryAt)
                            : "Not set"}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/orders/${order.id}`}
                            className="inline-flex items-center gap-1 font-semibold text-primary-strong underline-offset-2 hover:text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          >
                            {order.customerName}
                            <ArrowRightIcon className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                          <span className="text-xs font-medium text-text-muted">
                            #{order.id}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {order.serviceType} · {order.totalItems}{" "}
                          {order.totalItems === 1 ? "item" : "items"}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 sm:pl-0">
                      <StatusBadge status={order.status} />
                      {order.syncState !== "synced" ? (
                        <StatusBadge status={order.syncState} />
                      ) : null}
                      {stageAction ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            onAdvanceStatus?.(order, stageAction.intent)
                          }
                          className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-text transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent-strong disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {isBusy ? "Updating..." : stageAction.label}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
