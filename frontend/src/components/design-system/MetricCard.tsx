import React, { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  colorScheme?: "blue" | "emerald" | "amber" | "indigo" | "rose" | "slate";
  className?: string;
  onClick?: () => void;
}

const COLOR_MAP = {
  blue: {
    bg: "bg-blue-50/80",
    border: "border-blue-100",
    text: "text-blue-700",
    valueText: "text-slate-900",
  },
  emerald: {
    bg: "bg-emerald-50/80",
    border: "border-emerald-100",
    text: "text-emerald-700",
    valueText: "text-emerald-700",
  },
  amber: {
    bg: "bg-amber-50/80",
    border: "border-amber-100",
    text: "text-amber-700",
    valueText: "text-amber-700",
  },
  indigo: {
    bg: "bg-indigo-50/80",
    border: "border-indigo-100",
    text: "text-indigo-700",
    valueText: "text-indigo-700",
  },
  rose: {
    bg: "bg-rose-50/80",
    border: "border-rose-100",
    text: "text-rose-700",
    valueText: "text-rose-700",
  },
  slate: {
    bg: "bg-slate-50/80",
    border: "border-slate-100",
    text: "text-slate-700",
    valueText: "text-slate-900",
  },
};

export function MetricCard({
  label,
  value,
  icon,
  hint,
  colorScheme = "blue",
  className = "",
  onClick,
}: MetricCardProps) {
  const scheme = COLOR_MAP[colorScheme];

  return (
    <Card
      onClick={onClick}
      className={`rounded-2xl border-slate-200/80 bg-white shadow-2xs transition-all ${
        onClick ? "cursor-pointer hover:border-slate-300 hover:shadow-xs" : ""
      } ${className}`}
    >
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block truncate">
            {label}
          </span>
          <div
            className={`text-xl sm:text-2xl font-black font-mono tracking-tight mt-0.5 ${scheme.valueText}`}
          >
            {value}
          </div>
          {hint ? (
            <div className="text-[11px] text-slate-500 font-medium mt-1 truncate">
              {hint}
            </div>
          ) : null}
        </div>

        {icon ? (
          <div
            className={`size-11 rounded-2xl flex items-center justify-center shrink-0 border ${scheme.bg} ${scheme.border} ${scheme.text}`}
          >
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
