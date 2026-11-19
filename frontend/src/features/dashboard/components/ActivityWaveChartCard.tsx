import { useState, useId } from "react";
import type { DashboardKpiSummary, DashboardOrder } from "../types/dashboard.types";

export interface ActivityWaveChartCardProps {
  orders?: DashboardOrder[];
  summary?: DashboardKpiSummary;
  loading?: boolean;
}

type TimeRange = "3m" | "30d" | "7d";

interface ChartRangeConfig {
  key: TimeRange;
  label: string;
  subLabel: string;
  labels: string[];
  // Wave path control points for 3 stacked waves
  primaryPath: string;
  secondaryPath: string;
  tertiaryPath: string;
}

const RANGES: ChartRangeConfig[] = [
  {
    key: "3m",
    label: "Last 3 months",
    subLabel: "Total for the last 3 months",
    labels: [
      "Apr 7",
      "Apr 13",
      "Apr 19",
      "Apr 26",
      "May 2",
      "May 8",
      "May 14",
      "May 21",
      "May 28",
      "Jun 3",
      "Jun 9",
      "Jun 15",
      "Jun 22",
      "Jun 30",
    ],
    // High-resolution smooth multi-wave curves matching the reference design
    primaryPath:
      "M 0,180 C 25,175 45,120 70,110 C 95,100 115,160 140,150 C 165,140 180,90 205,85 C 230,80 250,140 275,130 C 300,120 320,70 345,65 C 370,60 390,130 415,125 C 440,120 460,70 485,60 C 510,50 530,135 555,120 C 580,105 600,60 625,55 C 650,50 670,120 695,110 C 720,100 740,55 765,50 C 790,45 810,130 835,115 C 860,100 880,55 905,50 C 930,45 955,110 975,105 C 990,100 1000,130 1000,130 L 1000,240 L 0,240 Z",
    secondaryPath:
      "M 0,205 C 25,200 45,160 70,150 C 95,140 115,190 140,185 C 165,180 180,140 205,135 C 230,130 250,175 275,170 C 300,165 320,125 345,120 C 370,115 390,170 415,165 C 440,160 460,120 485,115 C 510,110 530,175 555,165 C 580,155 600,120 625,115 C 650,110 670,165 695,155 C 720,145 740,110 765,105 C 790,100 810,170 835,160 C 860,150 880,110 905,105 C 930,100 955,155 975,150 C 990,145 1000,175 1000,175 L 1000,240 L 0,240 Z",
    tertiaryPath:
      "M 0,225 C 25,220 45,195 70,190 C 95,185 115,215 140,210 C 165,205 180,180 205,175 C 230,170 250,205 275,200 C 300,195 320,170 345,165 C 370,160 390,200 415,195 C 440,190 460,165 485,160 C 510,155 530,205 555,198 C 580,190 600,165 625,160 C 650,155 670,198 695,190 C 720,182 740,160 765,155 C 790,150 810,200 835,192 C 860,185 880,160 905,155 C 930,150 955,190 975,185 C 990,180 1000,205 1000,205 L 1000,240 L 0,240 Z",
  },
  {
    key: "30d",
    label: "Last 30 days",
    subLabel: "Total for the last 30 days",
    labels: [
      "May 1",
      "May 5",
      "May 10",
      "May 15",
      "May 20",
      "May 25",
      "May 30",
    ],
    primaryPath:
      "M 0,170 C 50,150 90,80 150,75 C 210,70 250,140 310,130 C 370,120 420,60 480,55 C 540,50 580,125 640,115 C 700,105 750,55 810,50 C 870,45 920,120 1000,105 L 1000,240 L 0,240 Z",
    secondaryPath:
      "M 0,195 C 50,180 90,130 150,125 C 210,120 250,170 310,165 C 370,160 420,115 480,110 C 540,105 580,160 640,150 C 700,140 750,110 810,105 C 870,100 920,160 1000,145 L 1000,240 L 0,240 Z",
    tertiaryPath:
      "M 0,220 C 50,210 90,175 150,170 C 210,165 250,200 310,195 C 370,190 420,165 480,160 C 540,155 580,195 640,188 C 700,180 750,160 810,155 C 870,150 920,195 1000,185 L 1000,240 L 0,240 Z",
  },
  {
    key: "7d",
    label: "Last 7 days",
    subLabel: "Total for the last 7 days",
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    primaryPath:
      "M 0,160 C 80,130 120,60 200,55 C 280,50 340,120 420,110 C 500,100 560,50 650,45 C 740,40 820,115 1000,90 L 1000,240 L 0,240 Z",
    secondaryPath:
      "M 0,190 C 80,165 120,115 200,110 C 280,105 340,155 420,150 C 500,145 560,105 650,100 C 740,95 820,155 1000,135 L 1000,240 L 0,240 Z",
    tertiaryPath:
      "M 0,215 C 80,200 120,165 200,160 C 280,155 340,190 420,185 C 500,180 560,155 650,150 C 740,145 820,190 1000,175 L 1000,240 L 0,240 Z",
  },
];

export function ActivityWaveChartCard({
  orders = [],
  summary,
  loading = false,
}: ActivityWaveChartCardProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>("3m");
  const gradientId1 = useId();
  const gradientId2 = useId();
  const gradientId3 = useId();

  const currentConfig =
    RANGES.find((r) => r.key === selectedRange) ?? RANGES[0];

  return (
    <section
      aria-label="Operations and order volume trends"
      className="ff-wave-card"
    >
      {/* Card Header matching reference: Title + Subtitle on left, Segmented filter tabs on right */}
      <div className="ff-wave-header">
        <div className="ff-wave-title-group">
          <h2 className="ff-wave-title">Total Visitors</h2>
          <p className="ff-wave-subtitle">{currentConfig.subLabel}</p>
        </div>

        <div
          role="tablist"
          aria-label="Chart time range"
          className="ff-wave-tabs"
        >
          {RANGES.map((range) => {
            const isSelected = selectedRange === range.key;
            return (
              <button
                key={range.key}
                role="tab"
                type="button"
                aria-selected={isSelected}
                className={`ff-wave-tab-btn ${isSelected ? "ff-wave-tab-active" : ""}`}
                onClick={() => setSelectedRange(range.key)}
              >
                {range.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Wave Area Chart */}
      <div className="ff-wave-chart-body">
        <div className="ff-wave-svg-wrap">
          <svg
            viewBox="0 0 1000 240"
            preserveAspectRatio="none"
            className="ff-wave-svg"
            aria-hidden="true"
          >
            <defs>
              {/* Layer 1: Dark Slate gradient with high contrast stroke */}
              <linearGradient id={gradientId1} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1E293B" stopOpacity="0.45" />
                <stop offset="65%" stopColor="#475569" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.02" />
              </linearGradient>

              {/* Layer 2: Middle translucent wave */}
              <linearGradient id={gradientId2} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#64748B" stopOpacity="0.3" />
                <stop offset="70%" stopColor="#94A3B8" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#CBD5E1" stopOpacity="0.01" />
              </linearGradient>

              {/* Layer 3: Bottom translucent wave */}
              <linearGradient id={gradientId3} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#E2E8F0" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Subtle horizontal grid lines */}
            <line
              x1="0"
              y1="60"
              x2="1000"
              y2="60"
              stroke="var(--ff-dash-border)"
              strokeDasharray="3 3"
              strokeOpacity="0.5"
            />
            <line
              x1="0"
              y1="120"
              x2="1000"
              y2="120"
              stroke="var(--ff-dash-border)"
              strokeDasharray="3 3"
              strokeOpacity="0.5"
            />
            <line
              x1="0"
              y1="180"
              x2="1000"
              y2="180"
              stroke="var(--ff-dash-border)"
              strokeDasharray="3 3"
              strokeOpacity="0.5"
            />

            {/* Tertiary / Bottom Wave */}
            <path
              d={currentConfig.tertiaryPath}
              fill={`url(#${gradientId3})`}
              stroke="#94A3B8"
              strokeWidth="1.2"
              className="transition-all duration-300 ease-in-out"
            />

            {/* Secondary / Middle Wave */}
            <path
              d={currentConfig.secondaryPath}
              fill={`url(#${gradientId2})`}
              stroke="#475569"
              strokeWidth="1.5"
              className="transition-all duration-300 ease-in-out"
            />

            {/* Primary / Top Wave */}
            <path
              d={currentConfig.primaryPath}
              fill={`url(#${gradientId1})`}
              stroke="#0F172A"
              strokeWidth="2"
              className="transition-all duration-300 ease-in-out"
            />
          </svg>
        </div>

        {/* X-Axis Date Ticks matching reference image */}
        <div className="ff-wave-x-axis">
          {currentConfig.labels.map((label, idx) => (
            <span key={idx} className="ff-wave-tick-label">
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
