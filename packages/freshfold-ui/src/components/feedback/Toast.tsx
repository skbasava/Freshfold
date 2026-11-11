import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  InfoCircleIcon,
  XCircleIcon,
} from "../icons";

export type ToastTone = "success" | "warning" | "danger" | "info";

export interface ToastProps {
  tone?: ToastTone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const toneStyles: Record<
  ToastTone,
  { container: string; icon: string; Icon: typeof CheckCircleIcon }
> = {
  success: {
    container: "border-success/30",
    icon: "text-success",
    Icon: CheckCircleIcon,
  },
  warning: {
    container: "border-warning/30",
    icon: "text-warning",
    Icon: AlertTriangleIcon,
  },
  danger: {
    container: "border-danger/30",
    icon: "text-danger",
    Icon: XCircleIcon,
  },
  info: {
    container: "border-primary/30",
    icon: "text-primary",
    Icon: InfoCircleIcon,
  },
};

export function Toast({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  className,
}: ToastProps) {
  const styles = toneStyles[tone];
  const role = tone === "danger" || tone === "warning" ? "alert" : "status";

  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border bg-surface p-4 shadow-raised",
        styles.container,
        className,
      )}
    >
      <styles.Icon className={cn("mt-0.5 h-5 w-5 shrink-0", styles.icon)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{title}</p>
        {children ? (
          <div className="mt-1 text-sm leading-6 text-text-muted">
            {children}
          </div>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-canvas hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export interface ToastViewportProps {
  children: ReactNode;
  className?: string;
}

export function ToastViewport({ children, className }: ToastViewportProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2",
        className,
      )}
    >
      <div className="pointer-events-auto flex flex-col gap-2">{children}</div>
    </div>
  );
}
