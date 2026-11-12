import {
  Alert,
  Badge,
  Button,
  Card,
  GoogleIcon,
  ShieldCheckIcon,
} from "@freshfold/ui";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useApi } from "../../api/context";
import { useAuth } from "../../auth/AuthContext";
import { AuthClientError } from "../../auth/supabase-auth-client";
import { isMockApiError } from "../../mocks/errors";
import { AuthLayout } from "./AuthLayout";

type OAuthErrorReason = "cancelled" | "failed";

interface LoginLocationState {
  oauthError?: OAuthErrorReason;
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof AuthClientError) {
    switch (error.code) {
      case "oauth_denied":
        return "Google sign-in was cancelled. Try again when you are ready.";
      case "rate_limited":
        return "Too many sign-in attempts. Wait a minute and try again.";
      case "provider_unavailable":
        return "Google sign-in is unavailable right now. Please try again.";
      default:
        return "We could not complete Google sign-in. Please try again.";
    }
  }
  if (isMockApiError(error)) {
    switch (error.status) {
      case 403:
        return "This Google account cannot access this hub.";
      case 429:
        return "Too many sign-in attempts. Wait a minute and try again.";
      default:
        return "We could not complete Google sign-in. Please try again.";
    }
  }
  return "We could not connect to Google sign-in. Check your connection and try again.";
}

function sessionNotice(
  reason: "expired" | "revoked" | undefined,
): { tone: "warning" | "danger"; message: string } | null {
  if (reason === "expired") {
    return {
      tone: "warning",
      message: "Your session ended. Please sign in again.",
    };
  }
  if (reason === "revoked") {
    return {
      tone: "danger",
      message:
        "Your access has been removed or is not enabled. Ask your manager to restore it.",
    };
  }
  return null;
}

function oauthCallbackNotice(
  oauthError: OAuthErrorReason | undefined,
): { tone: "warning" | "danger"; message: string } | null {
  if (oauthError === "cancelled") {
    return {
      tone: "warning",
      message: "Google sign-in was cancelled. Try again when you are ready.",
    };
  }
  if (oauthError === "failed") {
    return {
      tone: "danger",
      message:
        "We could not complete Google sign-in. Ask your hub manager if you still need access.",
    };
  }
  return null;
}

export function LoginPage() {
  const api = useApi();
  const auth = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sessionAlert =
    auth.state.status === "unauthenticated"
      ? sessionNotice(auth.state.reason)
      : null;

  const callbackAlert = oauthCallbackNotice(
    (location.state as LoginLocationState | null)?.oauthError,
  );

  const isMockDemo = api.mode === "mock" && auth.authProvider === "mock";
  const missingLiveSupabase =
    api.mode === "live" && auth.authProvider !== "supabase";
  const hasNotices = Boolean(
    sessionAlert || callbackAlert || error || missingLiveSupabase,
  );

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await auth.loginWithGoogle();
    } catch (caught) {
      setError(loginErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <Card padding="none" className="shadow-card">
        <div className="px-6 py-8 sm:px-8 sm:py-9">
          <div className="text-center">
            {isMockDemo ? (
              <div className="mb-3 flex justify-center">
                <Badge tone="primary" dot>
                  Demo mode
                </Badge>
              </div>
            ) : null}

            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Sign in to FreshFold
            </h1>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Use your work Google account to open your hub workspace.
            </p>
          </div>

          {hasNotices ? (
            <div className="mt-6 flex flex-col gap-3">
              {sessionAlert ? (
                <Alert tone={sessionAlert.tone} title={sessionAlert.message} />
              ) : null}
              {callbackAlert ? (
                <Alert tone={callbackAlert.tone} title={callbackAlert.message} />
              ) : null}
              {error ? <Alert tone="danger" title={error} /> : null}
              {missingLiveSupabase ? (
                <Alert
                  tone="warning"
                  title="Google sign-in is not configured in this environment."
                >
                  Add <code>VITE_SUPABASE_URL</code> and{" "}
                  <code>VITE_SUPABASE_ANON_KEY</code> with Google OAuth enabled
                  in Supabase Auth to sign in.
                </Alert>
              ) : null}
            </div>
          ) : null}

          <div className="mt-7">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={missingLiveSupabase}
              leadingIcon={<GoogleIcon className="h-5 w-5 shrink-0" />}
              onClick={() => void handleGoogleSignIn()}
              className="gap-3 shadow-card hover:border-primary/40 hover:bg-canvas/70"
            >
              {submitting ? "Connecting to Google..." : "Continue with Google"}
            </Button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-5 text-center text-xs text-text-muted">
            <ShieldCheckIcon className="h-4 w-4 shrink-0 text-primary" />
            <span>
              {isMockDemo
                ? "Sample hub workspace opens right away"
                : "Restricted to approved hub staff"}
            </span>
          </div>
        </div>
      </Card>

      <p className="mt-5 text-center text-xs leading-5 text-text-muted">
        Need hub access? Ask your manager to add your Google account.
      </p>
    </AuthLayout>
  );
}
