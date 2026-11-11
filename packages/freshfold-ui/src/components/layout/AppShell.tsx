import { useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { useMediaQuery } from "../../lib/use-media-query";

export interface AppShellControls {
  openNavigation: () => void;
}

export interface AppShellProps {
  sidebar: ReactNode;
  topbar: (controls: AppShellControls) => ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, topbar, children }: AppShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 64rem)");
  const navigationHidden = !isDesktop && !navigationOpen;

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
        onClick={() => setNavigationOpen(false)}
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[var(--sidebar-width)] border-r border-border bg-surface transition-transform duration-200 ease-out",
          navigationHidden ? "-translate-x-full" : "translate-x-0",
          "lg:translate-x-0",
        )}
      >
        {sidebar}
      </aside>

      <div className="min-w-0 lg:pl-[var(--sidebar-width)]">
        {topbar({ openNavigation: () => setNavigationOpen(true) })}
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
