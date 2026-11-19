import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "../context/AuthContext";

interface RedirectState {
  from?: {
    pathname?: string;
    search?: string;
  };
}

function resolveRedirectTarget(state: unknown): string {
  const from = (state as RedirectState | null)?.from;
  if (
    !from?.pathname ||
    from.pathname === "/login" ||
    from.pathname === "/login/callback" ||
    from.pathname === "/forgot-password"
  ) {
    return "/";
  }
  return `${from.pathname}${from.search ?? ""}`;
}

export interface PublicOnlyProps {
  children: ReactNode;
}

/**
 * Prevents authenticated staff from staying on `/login` or `/forgot-password`,
 * redirecting them back to their intended workspace route or the dashboard.
 */
export function PublicOnly({ children }: PublicOnlyProps) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <main
        aria-busy="true"
        aria-label="Checking session"
        className="flex min-h-svh items-center justify-center bg-background p-6"
      >
        <div className="w-full max-w-sm space-y-4">
          <Skeleton className="mx-auto h-9 w-36 rounded-lg" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      </main>
    );
  }

  if (status === "password_recovery") {
    return <Navigate to="/reset-password" replace />;
  }

  if (status === "authenticated") {
    return <Navigate to={resolveRedirectTarget(location.state)} replace />;
  }

  return <>{children}</>;
}
