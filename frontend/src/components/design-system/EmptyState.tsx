import React, { type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    render?: ReactNode;
    icon?: ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    render?: ReactNode;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`p-8 sm:p-12 text-center flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200/80 ${className}`}
    >
      <div className="size-16 rounded-3xl bg-blue-50/80 border border-blue-100 flex items-center justify-center mb-3.5 shadow-2xs">
        {icon}
      </div>

      <h3 className="text-base font-bold text-slate-900 tracking-tight">
        {title}
      </h3>
      <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-sm">
        {description}
      </p>

      {action || secondaryAction ? (
        <div className="flex items-center gap-2.5 mt-5">
          {action ? (
            <Button
              size="sm"
              onClick={action.onClick}
              render={action.render as any}
              className="pos-cta-btn h-9 px-4 rounded-xl text-xs font-bold gap-1.5 cursor-pointer shadow-2xs"
            >
              {action.icon}
              <span>{action.label}</span>
            </Button>
          ) : null}

          {secondaryAction ? (
            <Button
              size="sm"
              variant="outline"
              onClick={secondaryAction.onClick}
              render={secondaryAction.render as any}
              className="h-9 px-3.5 rounded-xl border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
