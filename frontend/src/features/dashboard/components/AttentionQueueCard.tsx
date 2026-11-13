import {
  AlertTriangleIcon,
  Badge,
  Button,
  CheckCircleIcon,
  StatusBadge,
  XCircleIcon,
} from "@freshfold/ui";
import type { AttentionItem } from "../../../mocks/types";

export interface AttentionQueueCardProps {
  items: AttentionItem[];
  onOpen: (href: string) => void;
}

export function AttentionQueueCard({
  items,
  onOpen,
}: AttentionQueueCardProps) {
  if (items.length === 0) {
    return (
      <section
        aria-label="Needs attention"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/25 bg-success/[0.04] px-5 py-3.5"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success/15 text-success-strong"
          >
            <CheckCircleIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text">
              No orders need attention
            </p>
            <p className="text-xs text-text-muted">
              You&apos;re all caught up. Holds and sync conflicts will appear
              here.
            </p>
          </div>
        </div>
        <Badge tone="success" dot>
          All clear
        </Badge>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="attention-queue-heading"
      className="overflow-hidden rounded-lg border border-warning/40 bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/25 bg-warning/[0.05] px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <AlertTriangleIcon className="h-4 w-4 text-warning-strong" />
          <h2
            id="attention-queue-heading"
            className="text-sm font-semibold tracking-tight text-text"
          >
            Needs attention
          </h2>
        </div>
        <Badge tone="warning" dot>
          {items.length} to check
        </Badge>
      </div>

      <ul className="divide-y divide-border/70">
        {items.map((item) => {
          const isDanger = item.tone === "danger";
          const Icon = isDanger ? XCircleIcon : AlertTriangleIcon;

          return (
            <li
              key={item.id}
              className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-canvas/60 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    isDanger
                      ? "bg-danger/10 text-danger-strong"
                      : "bg-warning/10 text-warning-strong"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    <span className="text-sm font-semibold text-text">
                      {item.customerName}
                    </span>
                    <span className="text-xs font-medium text-text-muted">
                      #{item.orderId}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-text-muted">
                    {item.reason}
                  </p>
                </div>
              </div>

              <Button
                variant={isDanger ? "primary" : "secondary"}
                size="sm"
                onClick={() => onOpen(item.href)}
                className="shrink-0 rounded-full"
              >
                {item.actionLabel}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
