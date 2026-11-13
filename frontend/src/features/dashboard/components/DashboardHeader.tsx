import {
  CalendarIcon,
  CheckCircleIcon,
  OrdersIcon,
  PlusIcon,
  SearchIcon,
} from "@freshfold/ui";
import type { DashboardSummary } from "../../../mocks/types";

export interface DashboardHeaderProps {
  dateLabel: string;
  summary?: DashboardSummary | null;
  allSaved?: boolean;
  onNewOrder: () => void;
  onScheduleDelivery?: () => void;
  onFindCustomer?: () => void;
  onViewOrders?: () => void;
}

export function DashboardHeader({
  dateLabel,
  summary,
  allSaved = false,
  onNewOrder,
  onScheduleDelivery,
  onFindCustomer,
  onViewOrders,
}: DashboardHeaderProps) {
  const capacityTotal = summary?.capacityTotal ?? 0;
  const capacityUsed = summary?.capacityUsed ?? 0;
  const remaining = Math.max(0, capacityTotal - capacityUsed);
  const percent =
    capacityTotal > 0
      ? Math.min(100, Math.round((capacityUsed / capacityTotal) * 100))
      : 0;

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percent / 100) * circumference;

  const ringStrokeClass =
    percent >= 100
      ? "stroke-danger"
      : percent >= 80
        ? "stroke-warning"
        : "stroke-accent";

  const readyCount = summary?.readyForDelivery ?? 0;
  const outCount = summary?.outForDelivery ?? 0;
  const attentionCount = summary?.needsAttention ?? 0;
  const pipelineTotal = Math.max(1, readyCount + outCount + attentionCount);

  return (
    <header className="grid gap-6 lg:grid-cols-12 lg:items-center">
      <div className="min-w-0 lg:col-span-7">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-strong">
            Front desk
          </p>
          <span className="text-xs font-medium text-text-muted">
            {dateLabel}
          </span>
          {allSaved ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success-strong"
            >
              <CheckCircleIcon className="h-3.5 w-3.5" />
              Everything is saved.
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Today at FreshFold
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted">
          Track deliveries along today&apos;s timeline, resolve holds fast, and
          keep every slot moving smoothly.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onNewOrder}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-surface shadow-card transition-all hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <PlusIcon className="h-4 w-4" />
            New order
          </button>

          {onScheduleDelivery ? (
            <button
              type="button"
              onClick={onScheduleDelivery}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent/40 hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <CalendarIcon className="h-4 w-4 text-accent-strong" />
              Schedule delivery
            </button>
          ) : null}

          {onFindCustomer ? (
            <button
              type="button"
              onClick={onFindCustomer}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent/40 hover:bg-accent/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <SearchIcon className="h-4 w-4 text-accent-strong" />
              Find customer
            </button>
          ) : null}

          {onViewOrders ? (
            <button
              type="button"
              onClick={onViewOrders}
              className="inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <OrdersIcon className="h-4 w-4" />
              All orders
            </button>
          ) : null}
        </div>
      </div>

      {summary && capacityTotal > 0 ? (
        <div className="flex items-center gap-5 rounded-lg border border-border/80 bg-surface p-5 shadow-card lg:col-span-5">
          <div
            role="progressbar"
            aria-label="Today's delivery capacity"
            aria-valuemin={0}
            aria-valuemax={capacityTotal}
            aria-valuenow={capacityUsed}
            className="relative grid h-24 w-24 shrink-0 place-items-center"
          >
            <svg viewBox="0 0 96 96" className="h-24 w-24 -rotate-90">
              <circle
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                strokeWidth="8"
                className="stroke-canvas"
              />
              <circle
                cx="48"
                cy="48"
                r={radius}
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className={`transition-[stroke-dashoffset] duration-300 ${ringStrokeClass}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-lg font-bold tracking-tight tabular-nums text-text">
                {percent}%
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Slots
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Hub capacity
            </p>
            <p className="mt-1 text-base font-semibold tabular-nums text-text">
              {capacityUsed} of {capacityTotal} booked
            </p>
            <p
              className={`mt-0.5 text-xs font-medium ${
                remaining === 0 ? "text-danger-strong" : "text-success-strong"
              }`}
            >
              {remaining === 0
                ? "All slots filled today"
                : `${remaining} delivery slots open`}
            </p>

            <div
              aria-hidden="true"
              className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-canvas"
            >
              <div
                className="h-full bg-success transition-[width] duration-300"
                style={{ width: `${(readyCount / pipelineTotal) * 100}%` }}
              />
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{ width: `${(outCount / pipelineTotal) * 100}%` }}
              />
              <div
                className="h-full bg-warning transition-[width] duration-300"
                style={{
                  width: `${(attentionCount / pipelineTotal) * 100}%`,
                }}
              />
            </div>

            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {readyCount} ready
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {outCount} out
              </span>
              {attentionCount > 0 ? (
                <span className="inline-flex items-center gap-1 font-medium text-warning-strong">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  {attentionCount} hold
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
