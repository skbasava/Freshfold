import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
  badge?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
}

export function Tabs({
  items,
  label,
  value,
  defaultValue,
  onChange,
  className,
}: TabsProps) {
  const baseId = useId();
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? items[0]?.value,
  );
  const activeValue = value ?? internalValue;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (items.length === 0) {
    return null;
  }

  const activeItem = items.find((item) => item.value === activeValue) ?? items[0];

  const select = (nextValue: string) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onChange?.(nextValue);
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % items.length;
        break;
      case "ArrowLeft":
        nextIndex = (index - 1 + items.length) % items.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    select(items[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className="flex flex-wrap gap-1 rounded-md border border-border bg-canvas/60 p-1"
      >
        {items.map((item, index) => {
          const active = item.value === activeItem.value;
          return (
            <button
              key={item.value}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              id={`${baseId}-tab-${item.value}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${baseId}-panel-${item.value}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(item.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                active
                  ? "bg-surface text-accent-strong ring-1 ring-accent/25 shadow-card"
                  : "text-text-muted hover:bg-surface/70 hover:text-text",
              )}
            >
              {item.label}
              {item.badge}
            </button>
          );
        })}
      </div>
      <div
        id={`${baseId}-panel-${activeItem.value}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${activeItem.value}`}
        tabIndex={0}
        className="mt-4 focus:outline-none"
      >
        {activeItem.content}
      </div>
    </div>
  );
}
