import { useState, type MouseEvent } from "react";
import { cn } from "../../lib/cn";

export interface CrnBadgeProps {
  crn: string;
  label?: string;
  showCopy?: boolean;
  truncate?: boolean;
  className?: string;
}

export function CrnBadge({
  crn,
  label,
  showCopy = true,
  truncate = true,
  className,
}: CrnBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (event: MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard?.writeText(crn);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-canvas px-2 py-1 text-xs",
        className,
      )}
    >
      {label ? (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
      ) : null}
      <span
        className={cn(
          "font-mono font-medium text-primary",
          truncate && "truncate max-w-[180px]",
        )}
        title={crn}
      >
        {crn}
      </span>
      {showCopy ? (
        <button
          type="button"
          onClick={handleCopy}
          className="cursor-pointer text-[11px] text-text-muted hover:text-primary transition-colors ml-0.5"
          title="Copy CRN identifier"
        >
          {copied ? "✓" : "Copy"}
        </button>
      ) : null}
    </div>
  );
}

