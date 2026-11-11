import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone =
  | "neutral"
  | "primary"
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
  primary: "border-primary/30 bg-primary/10 text-text",
  success: "border-success/30 bg-success/10 text-text",
  warning: "border-warning/30 bg-warning/10 text-text",
  danger: "border-danger/30 bg-danger/10 text-text",
  info: "border-primary/30 bg-primary/10 text-text",
};

const dotClasses: Record<BadgeTone, string> = {
  neutral: "bg-text-muted",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-primary",
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
