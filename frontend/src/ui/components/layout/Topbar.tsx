import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { ChevronDownIcon, ChevronRightIcon, MenuIcon, SearchIcon } from "../icons";

export interface TopbarUser {
  name: string;
  role?: string;
  email?: string;
}

export interface TopbarBreadcrumb {
  label: string;
  href?: string;
}

export interface TopbarSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export interface TopbarUserMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
}

export interface TopbarProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: TopbarBreadcrumb[];
  renderBreadcrumbLink?: (
    crumb: TopbarBreadcrumb,
    className: string,
  ) => ReactNode;
  search?: TopbarSearchProps;
  notifications?: ReactNode;
  user?: TopbarUser;
  userMenuHeader?: ReactNode;
  userMenuItems?: TopbarUserMenuItem[];
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
  breadcrumbs,
  renderBreadcrumbLink,
  search,
  notifications,
  user,
  userMenuHeader,
  userMenuItems,
  actions,
  onMenuClick,
  className,
}: TopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!menuContainerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    search?.onSubmit(search.value);
  };

  const hasBreadcrumbs = Boolean(breadcrumbs && breadcrumbs.length > 0);
  const hasMenu = Boolean(userMenuItems && userMenuItems.length > 0);

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border/50 bg-canvas/85 px-4 backdrop-blur-md sm:px-6 lg:px-8",
        className,
      )}
    >
      {onMenuClick ? (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/80 bg-surface text-text-muted shadow-card transition-colors hover:border-accent/40 hover:text-text lg:hidden",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          )}
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        {hasBreadcrumbs ? (
          <nav
            aria-label="Breadcrumb"
            className="mb-0.5 hidden items-center gap-1 text-xs text-text-muted sm:flex"
          >
            {breadcrumbs?.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const linkClass =
                "rounded-full px-1.5 py-0.5 transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

              return (
                <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
                  {index > 0 ? (
                    <ChevronRightIcon className="h-3.5 w-3.5 text-text-muted/70" />
                  ) : null}
                  {crumb.href && !isLast ? (
                    renderBreadcrumbLink ? (
                      renderBreadcrumbLink(crumb, linkClass)
                    ) : (
                      <a href={crumb.href} className={linkClass}>
                        {crumb.label}
                      </a>
                    )
                  ) : (
                    <span
                      aria-current={isLast ? "page" : undefined}
                      className={cn(isLast && "font-semibold text-text")}
                    >
                      {crumb.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
        ) : null}

        <div className="flex min-w-0 flex-col">
          <p className="truncate text-sm font-semibold tracking-tight text-text">
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-xs text-text-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {search ? (
        <form
          role="search"
          onSubmit={handleSearchSubmit}
          className="relative hidden md:block md:w-60 lg:w-72"
        >
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            aria-label={search.label ?? "Global search"}
            placeholder={search.placeholder ?? "Search orders or customers"}
            className="h-10 w-full rounded-full border border-border/80 bg-surface pr-4 pl-10 text-sm text-text shadow-card placeholder:text-text-muted transition-colors hover:border-text-muted/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </form>
      ) : null}

      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}

      {notifications ? (
        <div className="flex shrink-0 items-center">{notifications}</div>
      ) : null}

      {user ? (
        hasMenu ? (
          <div ref={menuContainerRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((prev) => !prev)}
              className={cn(
                "flex h-10 items-center gap-2.5 rounded-full border border-border/80 bg-surface py-1 pr-3 pl-1.5 text-left shadow-card transition-colors hover:border-accent/40",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              )}
            >
              <span
                aria-hidden="true"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary-strong"
              >
                {initials(user.name)}
              </span>
              <span className="hidden min-w-0 flex-col sm:flex">
                <span className="truncate text-xs font-semibold leading-tight text-text">
                  {user.name}
                </span>
                {user.role ? (
                  <span className="truncate text-[11px] leading-tight text-text-muted">
                    {user.role}
                  </span>
                ) : null}
              </span>
              <ChevronDownIcon
                className={cn(
                  "hidden h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-150 sm:block",
                  menuOpen && "rotate-180",
                )}
              />
            </button>

            {menuOpen ? (
              <div
                id={menuId}
                role="menu"
                aria-label="Account menu"
                className="absolute right-0 mt-2 w-60 origin-top-right rounded-lg border border-border/80 bg-surface p-1.5 shadow-raised"
              >
                <div className="border-b border-border/70 px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-text">
                    {user.name}
                  </p>
                  {user.email ? (
                    <p className="truncate text-xs text-text-muted">
                      {user.email}
                    </p>
                  ) : null}
                  {userMenuHeader ? (
                    <div className="mt-1.5">{userMenuHeader}</div>
                  ) : null}
                </div>

                <div className="py-1">
                  {userMenuItems?.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        item.onSelect();
                      }}
                      className={cn(
                        "flex min-h-9 w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        item.tone === "danger"
                          ? "text-danger-strong hover:bg-danger/10"
                          : "text-text hover:bg-canvas",
                      )}
                    >
                      {item.icon ? (
                        <span className="grid h-4 w-4 shrink-0 place-items-center">
                          {item.icon}
                        </span>
                      ) : null}
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5 rounded-full border border-border/80 bg-surface py-1 pr-3.5 pl-1.5 shadow-card">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary-strong"
            >
              {initials(user.name)}
            </span>
            <span className="hidden min-w-0 flex-col sm:flex">
              <span className="truncate text-xs font-semibold text-text">
                {user.name}
              </span>
              {user.role ? (
                <span className="truncate text-[11px] text-text-muted">
                  {user.role}
                </span>
              ) : null}
            </span>
          </div>
        )
      ) : null}
    </header>
  );
}
