import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-md bg-canvas text-text-muted">
          {icon}
        </span>
      ) : null}
      <p className="text-base font-semibold text-text">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm leading-6 text-text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
