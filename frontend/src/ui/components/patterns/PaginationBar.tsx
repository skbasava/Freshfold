import { Button } from "../primitives/Button";
import { cn } from "../../lib/cn";

export interface PaginationBarProps {
  page: number;
  pageCount: number;
  total?: number;
  itemLabel?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

export function PaginationBar({
  page,
  pageCount,
  total,
  itemLabel = "item",
  pageSize,
  pageSizeOptions = [4, 10, 20],
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 pt-2 text-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <p className="text-text-muted">
          Page {page} of {Math.max(1, pageCount)}
        </p>
        {total !== undefined ? (
          <span className="text-xs text-text-muted">
            ({total} {itemLabel}
            {total === 1 ? "" : "s"} total)
          </span>
        ) : null}

        {pageSize && onPageSizeChange && pageSizeOptions.length > 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-text-muted ml-2">
            <span>Per page:</span>
            {pageSizeOptions.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onPageSizeChange(size)}
                className={cn(
                  "rounded px-1.5 py-0.5 cursor-pointer transition-colors",
                  pageSize === size
                    ? "bg-primary text-surface font-semibold"
                    : "bg-canvas hover:bg-border/60 text-text",
                )}
              >
                {size}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Previous page
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
        >
          Next page
        </Button>
      </div>
    </div>
  );
}

