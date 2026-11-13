import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-border bg-canvas text-text-muted",
  primary: "border-primary/25 bg-primary/10 text-primary-strong",
  accent: "border-accent/30 bg-accent/10 text-accent-strong",
  success: "border-success/30 bg-success/10 text-success-strong",
  warning: "border-warning/30 bg-warning/10 text-warning-strong",
  danger: "border-danger/30 bg-danger/10 text-danger-strong",
  info: "border-info/30 bg-info/10 text-info-strong",
};

const dotClasses: Record<BadgeTone, string> = {
  neutral: "bg-text-muted",
  primary: "bg-primary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-medium leading-none",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full", dotClasses[tone])}
        />
      ) : null}
      {children}
    </span>
  );
}
