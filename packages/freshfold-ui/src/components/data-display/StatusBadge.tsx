import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "./Badge";

export type FreshFoldStatus =
  | "confirmed"
  | "processing"
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
  confirmed: { label: "Confirmed", tone: "primary" },
  processing: { label: "Washing", tone: "warning" },
  hold: { label: "On hold", tone: "warning" },
  out_for_delivery: { label: "Out for delivery", tone: "primary" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  pending: { label: "Pending sync", tone: "warning" },
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
