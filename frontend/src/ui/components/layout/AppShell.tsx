import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { useMediaQuery } from "../../lib/use-media-query";

export interface AppShellControls {
  openNavigation: () => void;
  closeNavigation: () => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
}

export interface AppShellProps {
  sidebar: ReactNode | ((controls: AppShellControls) => ReactNode);
  topbar: (controls: AppShellControls) => ReactNode;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
}

export function AppShell({
  sidebar,
  topbar,
  collapsed: controlledCollapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  children,
}: AppShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [uncontrolledCollapsed, setUncontrolledCollapsed] =
    useState(defaultCollapsed);
  const isDesktop = useMediaQuery("(min-width: 64rem)");
  const navigationHidden = !isDesktop && !navigationOpen;
  const collapsed = controlledCollapsed ?? uncontrolledCollapsed;

  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
  }, []);

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    if (controlledCollapsed === undefined) {
      setUncontrolledCollapsed(next);
    }
    onCollapsedChange?.(next);
  }, [collapsed, controlledCollapsed, onCollapsedChange]);

  useEffect(() => {
    if (!navigationOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavigationOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigationOpen]);

  const controls: AppShellControls = {
    openNavigation: () => setNavigationOpen(true),
    closeNavigation,
    collapsed,
    toggleCollapsed,
  };

  const handleSidebarClick = (event: MouseEvent<HTMLElement>) => {
    if (isDesktop) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("a[href], [data-close-navigation='true']")) {
      setNavigationOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main-content"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-text focus:shadow-raised",
        )}
      >
        Skip to main content
      </a>

      <div
        aria-hidden="true"
        onClick={() => setNavigationOpen(false)}
        className={cn(
          "fixed inset-0 z-30 bg-text/40 backdrop-blur-[2px] transition-opacity lg:hidden",
          navigationOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        id="app-sidebar"
        aria-hidden={navigationHidden}
        onClick={handleSidebarClick}
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[var(--sidebar-width)] border-r border-border/60 bg-surface shadow-card transition-[transform,width] duration-200 ease-out",
          collapsed && "lg:w-[var(--sidebar-collapsed-width)]",
          navigationHidden ? "-translate-x-full" : "translate-x-0",
          "lg:translate-x-0",
        )}
      >
        {typeof sidebar === "function" ? sidebar(controls) : sidebar}
      </aside>

      <div
        className={cn(
          "min-w-0 lg:transition-[padding-left] lg:duration-200 lg:ease-out",
          collapsed
            ? "lg:pl-[var(--sidebar-collapsed-width)]"
            : "lg:pl-[var(--sidebar-width)]",
        )}
      >
        {topbar(controls)}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-[calc(100vh-4rem)] focus:outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
