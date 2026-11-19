import { ArrowDownRight, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardKpiSummary } from "../types/dashboard.types";

export interface DashboardKpiRowProps {
  summary: DashboardKpiSummary;
  loading?: boolean;
}

interface KpiItemConfig {
  id: string;
  label: string;
  value: number;
  badge: string;
  badgeDirection: "up" | "down" | "neutral";
  footerTitle: string;
  footerSub: string;
}

export function DashboardKpiRow({
  summary,
  loading = false,
}: DashboardKpiRowProps) {
  const items: KpiItemConfig[] = [
    {
      id: "active",
      label: "Active Orders",
      value: summary.totalActive,
      badge: "+12.5%",
      badgeDirection: "up",
      footerTitle: "Trending up this month",
      footerSub: `${summary.deliveredToday} delivered today`,
    },
    {
      id: "processing",
      label: "In Progress",
      value: summary.processing,
      badge: "-20%",
      badgeDirection: "down",
      footerTitle: "Down 20% this period",
      footerSub: `${summary.confirmed} confirmed waiting`,
    },
    {
      id: "delivering",
      label: "Out for Delivery",
      value: summary.outForDelivery,
      badge: "+12.5%",
      badgeDirection: "up",
      footerTitle: "Strong slot fulfillment",
      footerSub: "Active IST delivery slots",
    },
    {
      id: "hold",
      label: "On Hold",
      value: summary.onHold,
      badge: summary.onHold > 0 ? "Alert" : "+4.5%",
      badgeDirection: summary.onHold > 0 ? "down" : "up",
      footerTitle:
        summary.onHold > 0 ? "Needs staff follow-up" : "Steady performance increase",
      footerSub:
        summary.onHold > 0 ? "Check hold notes below" : "Meets growth projections",
    },
  ];

  return (
    <section aria-label="Daily operations summary" className="ff-kpi-grid">
      {items.map((item) => {
        const isUp = item.badgeDirection === "up";
        const isDown = item.badgeDirection === "down";

        return (
          <article
            key={item.id}
            className="ff-kpi-card"
          >
            {/* Top row: Label on left, Trend pill badge on right matching reference */}
            <div className="ff-kpi-head">
              <span className="ff-kpi-label">{item.label}</span>
              <span
                className={`ff-kpi-badge-pill ${
                  isDown && item.id === "hold" && item.value > 0
                    ? "ff-kpi-badge-warn"
                    : isDown
                      ? "ff-kpi-badge-down"
                      : "ff-kpi-badge-up"
                }`}
              >
                {isUp ? (
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-3 shrink-0"
                  />
                ) : isDown ? (
                  <ArrowDownRight
                    aria-hidden="true"
                    className="size-3 shrink-0"
                  />
                ) : (
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-3 shrink-0"
                  />
                )}
                <span>{item.badge}</span>
              </span>
            </div>

            {/* Big prominent metric value */}
            {loading ? (
              <Skeleton className="h-9 w-20 rounded-md" />
            ) : (
              <div className="ff-kpi-value">{item.value}</div>
            )}

            {/* Subtitle with mini arrow + description lines matching reference */}
            <div className="ff-kpi-footer">
              {loading ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ) : (
                <>
                  <div className="ff-kpi-footer-title">
                    <span>{item.footerTitle}</span>
                    {isUp ? (
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 opacity-70"
                      />
                    ) : isDown ? (
                      <ArrowDownRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 opacity-70"
                      />
                    ) : null}
                  </div>
                  <span className="ff-kpi-footer-sub">{item.footerSub}</span>
                </>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
