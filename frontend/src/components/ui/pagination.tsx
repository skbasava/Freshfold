import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "./button";

export interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  label?: string;
  className?: string;
}

export function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  label = "items",
  className = "",
}: PaginationBarProps) {
  if (totalItems === 0) {
    return null;
  }

  const safeCurrentPage = Math.min(Math.max(currentPage, 1), Math.max(totalPages, 1));
  const startItem = (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  // Calculate visible page numbers
  const pages: number[] = [];
  const maxVisiblePages = 5;
  let startPage = Math.max(1, safeCurrentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    pages.push(p);
  }

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-surface border-t border-slate-200/80 text-xs text-slate-600 ${className}`}
    >
      {/* Left: Summary and Page Size */}
      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
        <span className="font-medium text-slate-600">
          Showing <span className="font-bold text-slate-900">{startItem}</span> to{" "}
          <span className="font-bold text-slate-900">{endItem}</span> of{" "}
          <span className="font-bold text-slate-900">{totalItems}</span> {label}
        </span>

        {onPageSizeChange ? (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[11px] text-slate-400 hidden md:inline">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 px-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / page
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {/* Right: Page Navigation Controls */}
      <div className="flex items-center gap-1">
        {/* First Page */}
        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => onPageChange(1)}
          disabled={safeCurrentPage <= 1}
          className="size-7 rounded-lg border-slate-200 text-slate-600 disabled:opacity-40 cursor-pointer"
          title="First page"
          aria-label="First page"
        >
          <ChevronsLeft className="size-3.5" />
        </Button>

        {/* Previous Page */}
        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1}
          className="size-7 rounded-lg border-slate-200 text-slate-600 disabled:opacity-40 cursor-pointer"
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
        </Button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1 mx-1">
          {startPage > 1 ? (
            <>
              <button
                type="button"
                onClick={() => onPageChange(1)}
                className="size-7 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                1
              </button>
              {startPage > 2 ? <span className="px-1 text-slate-400">…</span> : null}
            </>
          ) : null}

          {pages.map((p) => {
            const isActive = p === safeCurrentPage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`size-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {p}
              </button>
            );
          })}

          {endPage < totalPages ? (
            <>
              {endPage < totalPages - 1 ? <span className="px-1 text-slate-400">…</span> : null}
              <button
                type="button"
                onClick={() => onPageChange(totalPages)}
                className="size-7 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                {totalPages}
              </button>
            </>
          ) : null}
        </div>

        {/* Next Page */}
        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= totalPages}
          className="size-7 rounded-lg border-slate-200 text-slate-600 disabled:opacity-40 cursor-pointer"
          title="Next page"
          aria-label="Next page"
        >
          <ChevronRight className="size-3.5" />
        </Button>

        {/* Last Page */}
        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => onPageChange(totalPages)}
          disabled={safeCurrentPage >= totalPages}
          className="size-7 rounded-lg border-slate-200 text-slate-600 disabled:opacity-40 cursor-pointer"
          title="Last page"
          aria-label="Last page"
        >
          <ChevronsRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
