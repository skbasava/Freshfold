import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "./Badge";

export type FreshFoldStatus =
  | "new_order"
  | "confirmed"
  | "processing"
  | "washing"
  | "drying"
  | "ready_for_pickup"
  | "hold"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "pending"
  | "synced"
  | "conflict"
  | "rejected"
  | "offline";

interface StatusMeta {
  label: string;
  tone: BadgeTone;
}

const statusMeta: Record<FreshFoldStatus, StatusMeta> = {
  new_order: { label: "New order", tone: "info" },
  confirmed: { label: "Confirmed", tone: "primary" },
  processing: { label: "Washing", tone: "info" },
  washing: { label: "Washing", tone: "info" },
  drying: { label: "Drying", tone: "warning" },
  ready_for_pickup: { label: "Ready for pickup", tone: "accent" },
  out_for_delivery: { label: "Out for delivery", tone: "accent" },
  delivered: { label: "Delivered", tone: "success" },
  hold: { label: "On hold", tone: "warning" },
  pending: { label: "Pending sync", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "danger" },
  synced: { label: "Confirmed", tone: "success" },
  conflict: { label: "Needs review", tone: "danger" },
  rejected: { label: "Rejected", tone: "danger" },
  offline: { label: "Offline", tone: "neutral" },
};

export interface StatusBadgeProps {
  status: FreshFoldStatus | string;
  label?: ReactNode;
  className?: string;
  dot?: boolean;
}

export function StatusBadge({
  status,
  label,
  className,
  dot = true,
}: StatusBadgeProps) {
  const meta = statusMeta[status as FreshFoldStatus] ?? {
    label: status,
    tone: "neutral" as BadgeTone,
  };

  return (
    <Badge tone={meta.tone} dot={dot} className={className}>
      {label ?? meta.label}
    </Badge>
  );
}
