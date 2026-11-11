import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { MenuIcon } from "../icons";

export interface TopbarUser {
  name: string;
  role?: string;
}

export interface TopbarProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  user?: TopbarUser;
  actions?: ReactNode;
  onMenuClick?: () => void;
  className?: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Topbar({
  title = "FreshFold",
  subtitle,
  user,
  actions,
  onMenuClick,
  className,
}: TopbarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6",
        className,
      )}
    >
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-canvas hover:text-text lg:hidden",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          )}
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight text-text">
          {title}
        </p>
        {subtitle ? (
          <p className="truncate text-xs text-text-muted">{subtitle}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}

      {user ? (
        <div className="flex min-w-0 items-center gap-2 border-l border-border pl-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary-strong"
          >
            {initials(user.name)}
          </span>
          <span className="hidden min-w-0 flex-col sm:flex">
            <span className="truncate text-sm font-medium text-text">
              {user.name}
            </span>
            {user.role ? (
              <span className="truncate text-xs text-text-muted">
                {user.role}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </header>
  );
}
