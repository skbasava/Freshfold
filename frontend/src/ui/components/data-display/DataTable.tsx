import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { EmptyState } from "../feedback/EmptyState";
import { LoadingState } from "../feedback/LoadingState";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  caption?: string;
  emptyState?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  className?: string;
}

const alignClasses = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  emptyState,
  loading = false,
  loadingLabel = "Loading",
  className,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <LoadingState
        label={loadingLabel}
        rows={3}
        className={className}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <div className={className}>
        {emptyState ?? (
          <EmptyState
            title="Nothing to show yet"
            description="New items will appear here as work comes in."
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-border bg-surface",
        className,
      )}
    >
      <table className="min-w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border bg-canvas/60">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted",
                  alignClasses[column.align ?? "left"],
                  column.headerClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              className="border-b border-border/70 last:border-b-0 hover:bg-canvas/60"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3 align-middle text-text",
                    alignClasses[column.align ?? "left"],
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
