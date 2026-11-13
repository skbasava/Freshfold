import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { SparkleIcon } from "../icons";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode | null;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact = false,
  className,
}: EmptyStateProps) {
  const resolvedIcon =
    icon === undefined ? <SparkleIcon className="h-5 w-5" /> : icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface text-center",
        compact ? "px-4 py-8" : "px-6 py-12",
        className,
      )}
    >
      {resolvedIcon ? (
        <span
          aria-hidden="true"
          className={cn(
            "grid place-items-center rounded-md border border-primary/15 bg-primary/10 text-primary-strong",
            compact ? "mb-3 h-10 w-10" : "mb-4 h-12 w-12",
          )}
        >
          {resolvedIcon}
        </span>
      ) : null}
      <p className="text-base font-semibold text-text">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm leading-6 text-text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className={compact ? "mt-4" : "mt-5"}>{action}</div> : null}
    </div>
  );
}
