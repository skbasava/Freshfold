import React from "react";
import type { OrderStatus } from "@laundry/contracts";

export type BadgeSemanticVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple"
  | "slate";

export interface StatusBadgeProps {
  status?: OrderStatus | string;
  label?: string;
  variant?: BadgeSemanticVariant;
  size?: "sm" | "md" | "lg";
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

const ORDER_STATUS_MAP: Record<
  string,
  { label: string; variant: BadgeSemanticVariant; pulse?: boolean }
> = {
  draft: { label: "Draft", variant: "slate" },
  confirmed: { label: "Confirmed", variant: "info" },
  pickup_scheduled: { label: "Pickup Scheduled", variant: "info" },
  picked_up: { label: "Picked Up", variant: "info" },
  received: { label: "Received", variant: "info" },
  processing: { label: "In Process", variant: "warning", pulse: true },
  ready: { label: "Ready", variant: "success" },
  out_for_delivery: { label: "Delivering", variant: "info", pulse: true },
  delivered: { label: "Delivered", variant: "success" },
  hold: { label: "On Hold", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "danger" },
  // Billing / Payment statuses
  paid: { label: "Paid", variant: "success" },
  partially_paid: { label: "Partial", variant: "warning" },
  unpaid: { label: "Unpaid", variant: "danger" },
  refunded: { label: "Refunded", variant: "purple" },
  // Customer statuses
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "slate" },
  b2b: { label: "B2B / GSTIN", variant: "purple" },
};

const VARIANT_STYLES: Record<
  BadgeSemanticVariant,
  { container: string; dot: string }
> = {
  default: {
    container: "bg-slate-100 text-slate-700 border-slate-200/80",
    dot: "bg-slate-400",
  },
  slate: {
    container: "bg-slate-100 text-slate-600 border-slate-200/80",
    dot: "bg-slate-400",
  },
  info: {
    container: "bg-blue-50 text-blue-700 border-blue-200/80",
    dot: "bg-blue-600",
  },
  success: {
    container: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    dot: "bg-emerald-600",
  },
  warning: {
    container: "bg-amber-50 text-amber-800 border-amber-200/80",
    dot: "bg-amber-500",
  },
  danger: {
    container: "bg-rose-50 text-rose-700 border-rose-200/80",
    dot: "bg-rose-600",
  },
  purple: {
    container: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
    dot: "bg-indigo-600",
  },
};

const SIZE_STYLES = {
  sm: "text-[11px] px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-0.5 gap-1.5",
  lg: "text-sm px-3 py-1 gap-2",
};

export function StatusBadge({
  status,
  label,
  variant,
  size = "md",
  dot = true,
  pulse,
  className = "",
}: StatusBadgeProps) {
  const normalizedKey = status ? String(status).toLowerCase() : "";
  const mapped = normalizedKey ? ORDER_STATUS_MAP[normalizedKey] : undefined;

  const resolvedVariant = variant ?? mapped?.variant ?? "default";
  const resolvedLabel = label ?? mapped?.label ?? status ?? "Unknown";
  const shouldPulse = pulse ?? mapped?.pulse ?? false;

  const styles = VARIANT_STYLES[resolvedVariant];

  return (
    <span
      className={`inline-flex items-center font-bold tracking-tight rounded-full border transition-colors select-none ${styles.container} ${SIZE_STYLES[size]} ${className}`}
    >
      {dot ? (
        <span
          className={`size-1.5 rounded-full shrink-0 ${styles.dot} ${
            shouldPulse ? "animate-pulse" : ""
          }`}
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate">{resolvedLabel}</span>
    </span>
  );
}
