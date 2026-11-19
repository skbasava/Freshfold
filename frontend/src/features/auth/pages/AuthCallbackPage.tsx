import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AuthShell } from "@/components/blocks";
import { Button } from "@/components/ui/button";
import { AuthBrandPanel } from "../components/AuthBrandPanel";
import { AuthStatusCardBlock } from "../components/AuthStatusCardBlock";
import { useOptionalAuth } from "../context/AuthContext";
import { defaultAuthService } from "../services/auth.service";
import type { AuthService } from "../types/auth.types";

export interface AuthCallbackPageProps {
  authService?: AuthService;
}

export function AuthCallbackPage({ authService }: AuthCallbackPageProps = {}) {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const resolvedService = authService ?? auth?.authService ?? defaultAuthService;
  const refreshSession = auth?.refreshSession;
  const authStatus = auth?.status;
  const [error, setError] = useState<string | null>(null);

  // Immediately navigate as soon as AuthContext transitions to authenticated or recovery
  useEffect(() => {
    if (authStatus === "authenticated") {
      navigate("/", { replace: true });
    } else if (authStatus === "password_recovery") {
      navigate("/reset-password", { replace: true });
    }
  }, [authStatus, navigate]);

  // Execute PKCE callback exchange using only stable references (never depend on reactive `auth`)
  useEffect(() => {
    let active = true;

    void resolvedService.exchangeOAuthCallback().then(async (result) => {
      if (!active) {
        return;
      }

      if (!result.ok) {
        setError(
          result.error ??
            "We could not complete Google sign-in. Please try again.",
        );
        return;
      }

      if (refreshSession) {
        await refreshSession();
      }

      if (active) {
        navigate("/", { replace: true });
      }
    });

    return () => {
      active = false;
    };
  }, [navigate, refreshSession, resolvedService]);

  return (
    <AuthShell
      aside={<AuthBrandPanel />}
    >
      {error ? (
        <AuthStatusCardBlock
          tone="error"
          title="Sign-in could not finish"
          description="Something interrupted your Google sign-in."
          alertTitle="Authentication error"
          alertMessage={error}
          actions={
            <Button
              size="lg"
              className="w-full"
              nativeButton={false}
              render={<Link to="/login" />}
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              <span>Back to sign in</span>
            </Button>
          }
        />
      ) : (
        <AuthStatusCardBlock
          tone="loading"
          title="Completing sign-in"
          description="Verifying your Google account and staff permissions..."
        />
      )}
    </AuthShell>
  );
}
