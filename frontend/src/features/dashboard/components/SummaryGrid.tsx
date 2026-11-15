import {
  AlertTriangleIcon,
  CheckCircleIcon,
  MetricCard,
  OrdersIcon,
  TruckIcon,
  type MetricTone,
} from "@freshfold/ui";
import type { ReactNode } from "react";
import type { DashboardSummary } from "../../../types";

export type SummaryTone = "primary" | "accent" | "success" | "warning" | "danger";

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
  return (
    <MetricCard
      label={label}
      value={value}
      subtext={hint}
      tone={tone as MetricTone}
      icon={icon}
      onClick={onClick}
      className="rounded-none border-0 shadow-none p-5"
    />
  );
}

export interface SummaryGridProps {
  summary: DashboardSummary;
  onNavigate?: (path: string) => void;
}

export function SummaryGrid({ summary, onNavigate }: SummaryGridProps) {
  return (
    <section
      aria-label="Today's summary"
      className="grid overflow-hidden rounded-xl border border-border/80 bg-surface shadow-xs divide-y divide-border/70 sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0"
    >
      <SummaryCard
        label="Orders today"
        value={summary.ordersToday}
        hint="New orders at this hub"
        tone="primary"
        icon={<OrdersIcon className="h-4 w-4" />}
        onClick={onNavigate ? () => onNavigate("/orders") : undefined}
      />
      <SummaryCard
        label="Ready for delivery"
        value={summary.readyForDelivery}
        hint="Packed and waiting"
        tone="success"
        icon={<CheckCircleIcon className="h-4 w-4" />}
        onClick={onNavigate ? () => onNavigate("/deliveries") : undefined}
      />
      <SummaryCard
        label="Out for delivery"
        value={summary.outForDelivery}
        hint="With the delivery team"
        tone="accent"
        icon={<TruckIcon className="h-4 w-4" />}
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
        icon={<AlertTriangleIcon className="h-4 w-4" />}
        onClick={onNavigate ? () => onNavigate("/orders") : undefined}
      />
    </section>
  );
}
