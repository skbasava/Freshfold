import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type MetricTone = "primary" | "accent" | "warning" | "success" | "danger" | "neutral";

export interface MetricCardProps {
  label: string;
  value: number | string;
  subtext?: string;
  hint?: string;
  icon: ReactNode;
  tone?: MetricTone;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

const toneStyles: Record<
  MetricTone,
  {
    iconBg: string;
    iconText: string;
    activeBorder: string;
    activeBg: string;
    textTone?: string;
  }
> = {
  primary: {
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    activeBorder: "border-primary",
    activeBg: "bg-primary/5",
  },
  accent: {
    iconBg: "bg-accent/10",
    iconText: "text-accent-strong",
    activeBorder: "border-accent",
    activeBg: "bg-accent/5",
    textTone: "text-accent-strong",
  },
  warning: {
    iconBg: "bg-warning/10",
    iconText: "text-warning",
    activeBorder: "border-warning",
    activeBg: "bg-warning/5",
    textTone: "text-warning",
  },
  success: {
    iconBg: "bg-success/10",
    iconText: "text-success",
    activeBorder: "border-success",
    activeBg: "bg-success/5",
    textTone: "text-success",
  },
  danger: {
    iconBg: "bg-danger/10",
    iconText: "text-danger",
    activeBorder: "border-danger",
    activeBg: "bg-danger/5",
    textTone: "text-danger",
  },
  neutral: {
    iconBg: "bg-canvas",
    iconText: "text-text-muted",
    activeBorder: "border-text-muted",
    activeBg: "bg-canvas/50",
  },
};

export function MetricCard({
  label,
  value,
  subtext,
  hint,
  icon,
  tone = "primary",
  active = false,
  onClick,
  className,
}: MetricCardProps) {
  const styles = (tone && toneStyles[tone]) || toneStyles.primary;
  const isClickable = Boolean(onClick);
  const displaySubtext = subtext ?? hint;

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isClickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "flex items-center justify-between rounded-xl border p-4 transition-all",
        isClickable && "cursor-pointer",
        active
          ? `${styles.activeBorder} ${styles.activeBg} shadow-xs`
          : "border-border bg-surface hover:border-primary/40 hover:bg-canvas/50",
        className,
      )}
    >
      <div className="flex flex-col min-w-0 pr-3">
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            styles.textTone ?? "text-text-muted",
          )}
        >
          {label}
        </span>
        <span className="mt-1 text-2xl font-bold text-text truncate">{value}</span>
        {displaySubtext ? (
          <span className="mt-0.5 text-xs text-text-muted truncate">{displaySubtext}</span>
        ) : null}
      </div>
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          styles.iconBg,
          styles.iconText,
        )}
      >
        {icon}
      </div>
    </div>
  );
}

