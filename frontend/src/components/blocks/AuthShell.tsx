import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import Logo from "/assets/img/light_theme_logo.webp";

export interface AuthShellProps {
  /** Optional left-hand promotional or informational panel shown on desktop (lg+). */
  aside?: ReactNode;
  /** Primary authentication card / form block. */
  children: ReactNode;
  className?: string;
}

/**
 * Reusable responsive authentication shell block.
 * Renders a balanced split-screen on desktop when `aside` is provided,
 * and gracefully collapses to a centered single-column layout on smaller viewports.
 */
export function AuthShell({ aside, children, className }: AuthShellProps) {
  return (
    <div
      className={cn(
        "grid min-h-svh bg-muted/40",
        aside ? "lg:grid-cols-2" : "place-items-center",
        className,
      )}
    >
      {aside ? (
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
          {aside}
        </aside>
      ) : null}

      <main className="flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className={cn("flex justify-center", aside && "lg:hidden")}>
            <img src={Logo} alt="logo" width={180} height={100} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
