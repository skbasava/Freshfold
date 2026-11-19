import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LogOut, RefreshCw } from "lucide-react";
import { AuthShell } from "@/components/blocks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthStatusCardBlock } from "../components/AuthStatusCardBlock";
import { useAuth } from "../context/AuthContext";

function SessionBootstrapSkeleton() {
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

export interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Fail-closed route guard protecting every route except public auth pages.
 * Verifies server-authorized session state (ADR-015):
 * - loading           -> Skeleton bootstrap state
 * - unauthenticated   -> Redirect to `/login` preserving intended destination
 * - password_recovery -> Redirect to `/reset-password`
 * - denied (403)      -> Fail-closed Access Denied card with Sign Out
 * - error (503/net)   -> Retryable Session Verification Error card
 * - authenticated     -> Render protected workspace
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { state, refreshSession, signOut } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return <SessionBootstrapSkeleton />;
  }

  if (state.status === "password_recovery") {
    return <Navigate to="/reset-password" replace />;
  }

  if (state.status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (state.status === "denied") {
    const title =
      state.code === "membership_inactive"
        ? "Account inactive"
        : "Staff access not assigned";
    return (
      <AuthShell>
        <AuthStatusCardBlock
          tone="denied"
          title={title}
          description="You are signed in to Supabase, but this account cannot access the workspace."
          alertTitle={
            state.code === "membership_inactive"
              ? "Access revoked"
              : "Membership missing"
          }
          alertMessage={state.message}
          actions={
            <>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => void refreshSession()}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                <span>Check access again</span>
              </Button>
              <Button
                variant="destructive"
                size="lg"
                className="w-full"
                onClick={() => void signOut()}
              >
                <LogOut aria-hidden="true" className="size-4" />
                <span>Sign out</span>
              </Button>
            </>
          }
          footer={
            state.email
              ? `Signed in as ${state.email}`
              : "Ask your hub manager to assign your role and hub."
          }
        />
      </AuthShell>
    );
  }

  if (state.status === "error") {
    return (
      <AuthShell>
        <AuthStatusCardBlock
          tone="error"
          title="Could not verify session"
          description="We could not confirm your staff permissions with the server."
          alertTitle="Verification unavailable"
          alertMessage={state.message}
          actions={
            <>
              <Button
                size="lg"
                className="w-full"
                onClick={() => void refreshSession()}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                <span>Try again</span>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => void signOut()}
              >
                <LogOut aria-hidden="true" className="size-4" />
                <span>Sign out</span>
              </Button>
            </>
          }
        />
      </AuthShell>
    );
  }

  return <>{children}</>;
}
