import { Button } from "../primitives/Button";
import { cn } from "../../lib/cn";

export interface StatusPillItem {
  value: string;
  label: string;
  count?: number;
}

export interface StatusPillsProps {
  items: StatusPillItem[];
  activeValue: string;
  onChange: (value: string) => void;
  label?: string;
  onClear?: () => void;
  showClear?: boolean;
  className?: string;
}

export function StatusPills({
  items,
  activeValue,
  onChange,
  label = "Quick filter:",
  onClear,
  showClear = false,
  className,
}: StatusPillsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {label ? (
        <span className="text-xs font-medium text-text-muted mr-1">{label}</span>
      ) : null}
      {items.map((item) => {
        const active = activeValue === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              active
                ? "bg-primary text-surface shadow-xs"
                : "bg-canvas text-text-muted hover:bg-border/60 hover:text-text",
            )}
          >
            <span>{item.label}</span>
            {item.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                  active ? "bg-surface/20 text-surface" : "bg-border text-text-muted",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
      {showClear && onClear ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear all
        </Button>
      ) : null}
    </div>
  );
}

