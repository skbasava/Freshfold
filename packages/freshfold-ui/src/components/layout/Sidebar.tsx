import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { SparkleIcon } from "../icons";

export interface SidebarItem {
  label: string;
  href: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export interface SidebarLinkProps {
  className: string;
  "aria-current": "page" | undefined;
  children: ReactNode;
}

export type SidebarLinkRenderer = (
  item: SidebarItem,
  props: SidebarLinkProps,
) => ReactNode;

export interface SidebarProps {
  items: SidebarItem[];
  activePath?: string;
  brand?: ReactNode;
  footer?: ReactNode;
  renderLink?: SidebarLinkRenderer;
  className?: string;
}

function DefaultBrand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-primary text-surface shadow-card">
        <SparkleIcon className="h-5 w-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-base font-semibold tracking-tight text-text">
          FreshFold
        </span>
        <span className="text-xs text-text-muted">Laundry workspace</span>
      </span>
    </div>
  );
}

export function Sidebar({
  items,
  activePath,
  brand,
  footer,
  renderLink,
  className,
}: SidebarProps) {
  const linkClasses = (active: boolean): string =>
    cn(
      "group flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
      active
        ? "bg-primary text-surface shadow-card"
        : "text-text-muted hover:bg-canvas hover:text-text",
    );

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="px-4 py-5">{brand ?? <DefaultBrand />}</div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active = item.href === activePath;
            const content = (
              <>
                {item.icon ? (
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center",
                      active ? "text-surface" : "text-text-muted",
                    )}
                  >
                    {item.icon}
                  </span>
                ) : null}
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span
                    className={cn(
                      "ml-auto rounded-sm px-2 py-0.5 text-xs font-semibold",
                      active
                        ? "bg-surface/20 text-surface"
                        : "bg-canvas text-text-muted",
                    )}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </>
            );

            return (
              <li key={item.href}>
                {renderLink ? (
                  renderLink(item, {
                    className: linkClasses(active),
                    "aria-current": active ? "page" : undefined,
                    children: content,
                  })
                ) : (
                  <a
                    href={item.href}
                    className={linkClasses(active)}
                    aria-current={active ? "page" : undefined}
                  >
                    {content}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {footer ? (
        <div className="border-t border-border p-3">{footer}</div>
      ) : null}
    </div>
  );
}
