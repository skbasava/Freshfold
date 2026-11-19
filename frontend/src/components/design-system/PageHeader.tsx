import React, { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  badge,
  backHref,
  backLabel = "Back",
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs ${className}`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {backHref ? (
          <Button
            variant="outline"
            size="icon-xs"
            nativeButton={false}
            render={<Link to={backHref} />}
            className="size-8 rounded-xl border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 shrink-0"
            title={backLabel}
            aria-label={backLabel}
          >
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}

        {icon ? (
          <div className="p-2.5 rounded-2xl bg-blue-50/80 border border-blue-100/90 flex items-center justify-center shrink-0">
            {icon}
          </div>
        ) : null}

        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 truncate">
              {title}
            </h1>
            {badge ? <div>{badge}</div> : null}
          </div>
          {subtitle ? (
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
