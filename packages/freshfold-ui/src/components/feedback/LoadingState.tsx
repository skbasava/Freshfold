import { cn } from "../../lib/cn";

export interface LoadingStateProps {
  label?: string;
  rows?: number;
  className?: string;
}

export function LoadingState({
  label = "Loading",
  rows = 3,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-text-muted">
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
        />
        <span>{label}</span>
      </div>
      {rows > 0 ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: rows }, (_, index) => (
            <div
              key={index}
              data-testid="loading-row"
              className="flex items-center gap-3 rounded-md border border-border bg-surface p-3"
            >
              <span className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-border/60" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-3 w-2/5 animate-pulse rounded-sm bg-border/60" />
                <span className="h-3 w-3/5 animate-pulse rounded-sm bg-border/40" />
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
