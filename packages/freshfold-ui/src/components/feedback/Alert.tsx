import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  InfoCircleIcon,
  XCircleIcon,
} from "../icons";

export type AlertTone = "success" | "warning" | "danger" | "info";

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const toneStyles: Record<
  AlertTone,
  { container: string; icon: string; title: string; Icon: typeof InfoCircleIcon }
> = {
  success: {
    container: "border-success/30 bg-success/5",
    icon: "text-success",
    title: "text-success-strong",
    Icon: CheckCircleIcon,
  },
  warning: {
    container: "border-warning/30 bg-warning/5",
    icon: "text-warning",
    title: "text-warning-strong",
    Icon: AlertTriangleIcon,
  },
  danger: {
    container: "border-danger/30 bg-danger/5",
    icon: "text-danger",
    title: "text-danger-strong",
    Icon: XCircleIcon,
  },
  info: {
    container: "border-primary/30 bg-primary/5",
    icon: "text-primary",
    title: "text-primary-strong",
    Icon: InfoCircleIcon,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  className,
}: AlertProps) {
  const styles = toneStyles[tone];
  const role = tone === "danger" || tone === "warning" ? "alert" : "status";

  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-3 rounded-md border p-4",
        styles.container,
        className,
      )}
    >
      <styles.Icon className={cn("mt-0.5 h-5 w-5 shrink-0", styles.icon)} />
      <div className="min-w-0 flex-1">
        {title ? (
          <p className={cn("text-sm font-semibold", styles.title)}>{title}</p>
        ) : null}
        {children ? (
          <div
            className={cn(
              "text-sm leading-6 text-text-muted",
              title ? "mt-1" : undefined,
            )}
          >
            {children}
          </div>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
