import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  padding?: CardPadding;
}

const paddingClasses: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Card({
  title,
  description,
  actions,
  footer,
  padding = "md",
  className,
  children,
  ...props
}: CardProps) {
  const hasHeader = title || description || actions;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-surface shadow-card",
        className,
      )}
      {...props}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-sm font-semibold tracking-tight text-text">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}

      {children ? (
        <div className={paddingClasses[padding]}>{children}</div>
      ) : null}

      {footer ? (
        <div className="border-t border-border bg-canvas/60 px-5 py-3 text-xs text-text-muted">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
