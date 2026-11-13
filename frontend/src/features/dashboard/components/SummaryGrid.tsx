import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  OrdersIcon,
  TruckIcon,
} from "@freshfold/ui";
import type { ReactNode } from "react";
import type { DashboardSummary } from "../../../mocks/types";

export type SummaryTone = "primary" | "accent" | "success" | "warning" | "danger";

const summaryToneStyles: Record<
  SummaryTone,
  {
    bgHover: string;
    iconBg: string;
    valueColor: string;
  }
> = {
  primary: {
    bgHover: "hover:bg-primary/[0.03]",
    iconBg: "bg-primary/10 text-primary-strong",
    valueColor: "text-text",
  },
  accent: {
    bgHover: "hover:bg-accent/[0.04]",
    iconBg: "bg-accent/12 text-accent-strong",
    valueColor: "text-text",
  },
  success: {
    bgHover: "hover:bg-success/[0.03]",
    iconBg: "bg-success/10 text-success-strong",
    valueColor: "text-text",
  },
  warning: {
    bgHover: "hover:bg-warning/[0.05]",
    iconBg: "bg-warning/15 text-warning-strong",
    valueColor: "text-warning-strong",
  },
  danger: {
    bgHover: "hover:bg-danger/[0.05]",
    iconBg: "bg-danger/15 text-danger-strong",
    valueColor: "text-danger-strong",
  },
};

export interface SummaryCardProps {
  label: string;
  value: number;
  hint: string;
  tone: SummaryTone;
  icon: ReactNode;
  onClick?: () => void;
}

export function SummaryCard({
  label,
  value,
  hint,
  tone,
  icon,
  onClick,
}: SummaryCardProps) {
  const styles = summaryToneStyles[tone];

  const content = (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${styles.iconBg}`}
          >
            {icon}
          </span>
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-text-muted">
            {label}
          </p>
        </div>

        <p
          className={`mt-3 text-3xl font-bold tracking-tight tabular-nums ${styles.valueColor}`}
        >
          {value}
        </p>
        <p className="mt-1 truncate text-xs text-text-muted">{hint}</p>
      </div>

      {onClick ? (
        <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-text-muted/60 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-strong" />
      ) : null}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`group w-full p-5 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${styles.bgHover}`}
      >
        {content}
      </button>
    );
  }

  return <div className="p-5">{content}</div>;
}

export interface SummaryGridProps {
  summary: DashboardSummary;
  onNavigate?: (path: string) => void;
}

export function SummaryGrid({ summary, onNavigate }: SummaryGridProps) {
  return (
    <section
      aria-label="Today's summary"
      className="grid overflow-hidden rounded-lg border border-border/80 bg-surface shadow-card divide-y divide-border/70 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0"
    >
      <SummaryCard
        label="Orders today"
        value={summary.ordersToday}
        hint="New orders at this hub"
        tone="primary"
        icon={<OrdersIcon className="h-3.5 w-3.5" />}
        onClick={onNavigate ? () => onNavigate("/orders") : undefined}
      />
      <SummaryCard
        label="Ready for delivery"
        value={summary.readyForDelivery}
        hint="Packed and waiting"
        tone="success"
        icon={<CheckCircleIcon className="h-3.5 w-3.5" />}
        onClick={onNavigate ? () => onNavigate("/deliveries") : undefined}
      />
      <SummaryCard
        label="Out for delivery"
        value={summary.outForDelivery}
        hint="With the delivery team"
        tone="accent"
        icon={<TruckIcon className="h-3.5 w-3.5" />}
        onClick={onNavigate ? () => onNavigate("/deliveries") : undefined}
      />
      <SummaryCard
        label="Needs attention"
        value={summary.needsAttention}
        hint={
          summary.needsAttention > 0
            ? "Hold, late or conflicting"
            : "All orders on track"
        }
        tone={summary.needsAttention > 0 ? "warning" : "success"}
        icon={<AlertTriangleIcon className="h-3.5 w-3.5" />}
        onClick={onNavigate ? () => onNavigate("/orders") : undefined}
      />
    </section>
  );
}
