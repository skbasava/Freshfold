import { cn } from "../../lib/cn";

export type LoadingStateVariant = "list" | "cards" | "table" | "detail";

export interface LoadingStateProps {
  label?: string;
  description?: string;
  rows?: number;
  variant?: LoadingStateVariant;
  className?: string;
}

function SkeletonRows({
  rows,
  bordered = true,
}: {
  rows: number;
  bordered?: boolean;
}) {
  const widths = [
    ["w-2/5", "w-3/5"],
    ["w-1/3", "w-1/2"],
    ["w-1/2", "w-2/5"],
  ] as const;

  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => {
        const [titleWidth, subtitleWidth] = widths[index % widths.length];
        return (
          <div
            key={index}
            data-testid="loading-row"
            className={cn(
              "flex items-center gap-3 p-3",
              bordered
                ? "rounded-md border border-border bg-surface"
                : "border-b border-border/70 last:border-b-0",
            )}
          >
            <span className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-border/60" />
            <span className="flex flex-1 flex-col gap-2">
              <span
                className={cn(
                  "h-3 animate-pulse rounded-sm bg-border/70",
                  titleWidth,
                )}
              />
              <span
                className={cn(
                  "h-3 animate-pulse rounded-sm bg-border/40",
                  subtitleWidth,
                )}
              />
            </span>
            <span className="hidden h-5 w-16 shrink-0 animate-pulse rounded-full bg-border/50 sm:block" />
          </div>
        );
      })}
    </div>
  );
}

export function LoadingState({
  label = "Loading",
  description,
  rows = 3,
  variant = "list",
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex items-center gap-2.5 text-sm font-medium text-text-muted">
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
        />
        <div className="flex flex-col">
          <span className="text-text">{label}</span>
          {description ? (
            <span className="text-xs font-normal text-text-muted">
              {description}
            </span>
          ) : null}
        </div>
      </div>

      {rows > 0 && variant === "cards" ? (
        <div className="flex flex-col gap-4" aria-hidden="true">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <span className="mb-4 block h-1 w-9 animate-pulse rounded-full bg-primary/30" />
                <span className="block h-3 w-24 animate-pulse rounded-sm bg-border/60" />
                <span className="mt-3 block h-7 w-14 animate-pulse rounded-sm bg-border/70" />
                <span className="mt-2 block h-3 w-32 animate-pulse rounded-sm bg-border/40" />
              </div>
            ))}
          </div>
          <SkeletonRows rows={rows} />
        </div>
      ) : null}

      {rows > 0 && variant === "table" ? (
        <div
          aria-hidden="true"
          className="overflow-hidden rounded-lg border border-border bg-surface"
        >
          <div className="flex items-center gap-4 border-b border-border bg-canvas/70 px-4 py-3">
            <span className="h-3 w-24 animate-pulse rounded-sm bg-border/70" />
            <span className="h-3 w-28 animate-pulse rounded-sm bg-border/60" />
            <span className="ml-auto h-3 w-16 animate-pulse rounded-sm bg-border/60" />
          </div>
          <SkeletonRows rows={rows} bordered={false} />
        </div>
      ) : null}

      {rows > 0 && variant === "detail" ? (
        <div
          aria-hidden="true"
          className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]"
        >
          <SkeletonRows rows={rows} />
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
            <span className="h-4 w-28 animate-pulse rounded-sm bg-border/70" />
            <span className="h-6 w-40 animate-pulse rounded-sm bg-border/60" />
            <span className="h-3 w-full animate-pulse rounded-sm bg-border/40" />
            <span className="h-10 w-full animate-pulse rounded-md bg-border/50" />
          </div>
        </div>
      ) : null}

      {rows > 0 && variant === "list" ? <SkeletonRows rows={rows} /> : null}
    </div>
  );
}
