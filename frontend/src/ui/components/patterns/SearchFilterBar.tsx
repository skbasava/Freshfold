import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Card } from "../data-display/Card";
import { Input } from "../primitives/Input";

export interface SearchFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  title?: string;
  description?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  bottomSlot?: ReactNode;
  className?: string;
}

export function SearchFilterBar({
  search,
  onSearchChange,
  searchLabel = "Search",
  searchPlaceholder = "Search...",
  title,
  description,
  filters,
  actions,
  bottomSlot,
  className,
}: SearchFilterBarProps) {
  return (
    <Card title={title} description={description} actions={actions} className={className}>
      <div className="flex flex-col gap-4">
        <div
          className={cn(
            "grid gap-4 items-end",
            filters ? "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]" : "w-full",
          )}
        >
          <Input
            label={searchLabel}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {filters}
        </div>
        {bottomSlot ? (
          <div className="pt-2 border-t border-border">{bottomSlot}</div>
        ) : null}
      </div>
    </Card>
  );
}

