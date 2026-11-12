import {
  Alert,
  Badge,
  Button,
  CalendarIcon,
  Card,
  GoogleIcon,
  OrdersIcon,
  ShieldCheckIcon,
  TruckIcon,
} from "@freshfold/ui";
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useApi } from "../../api/context";
import { useAuth } from "../../auth/AuthContext";
import { AuthClientError } from "../../auth/supabase-auth-client";
import { isMockApiError } from "../../mocks/errors";
import { AuthLayout, FreshFoldBrandMark } from "./AuthLayout";

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

function ShowcaseFeature({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-md border border-border bg-surface p-4 shadow-card">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="mt-0.5 text-sm leading-5 text-text-muted">
          {description}
        </p>
      </div>
    </div>
  );
}

function FreshFoldAuthShowcase() {
  return (
    <div className="pr-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FreshFoldBrandMark />
        <Badge tone="primary" dot>
          Google Workspace SSO
        </Badge>
      </div>

      <div className="mt-8">
        <h2 className="text-3xl font-semibold tracking-tight text-text">
          Clean laundry operations, ready for every shift.
        </h2>
        <p className="mt-3 text-base leading-7 text-text-muted">
          One workspace for front-desk intake, delivery slot capacity, and
          automatic Google Calendar updates.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        <ShowcaseFeature
          icon={<OrdersIcon className="h-5 w-5" />}
          title="Fast front-desk intake"
          description="Create and update orders in seconds—even when hub Wi-Fi drops—with safe offline queuing."
        />
        <ShowcaseFeature
          icon={<TruckIcon className="h-5 w-5" />}
          title="Protected delivery capacity"
          description="Live time-slot limits prevent double-booking and keep dispatch runs on schedule."
        />
        <ShowcaseFeature
          icon={<CalendarIcon className="h-5 w-5" />}
          title="Synced hub calendar"
          description="Every confirmed order and reschedule stays aligned on your hub Google Calendar."
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-text-muted">
        <span className="inline-flex items-center gap-2 font-medium text-text">
          <ShieldCheckIcon className="h-4 w-4 text-success" />
          Hub-verified staff roles
        </span>
        <span>Hub schedule in IST (Asia/Kolkata)</span>
      </div>
    </div>
  );
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
    <AuthLayout aside={<FreshFoldAuthShowcase />}>
      <Card
        padding="none"
        className="shadow-raised"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span>Need access? Ask your hub manager.</span>
            <span className="font-medium text-text">Verified Hub SSO</span>
          </div>
        }
      >
        <div className="border-b border-border px-6 pt-7 pb-6 sm:px-8 sm:pt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="neutral" dot>
              Staff portal
            </Badge>
            {isMockDemo ? <Badge tone="primary">Demo data</Badge> : null}
          </div>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-text">
            Sign in to FreshFold
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Use your work Google account to open your assigned hub workspace.
          </p>
        </div>

        <div className="flex flex-col gap-5 px-6 py-7 sm:px-8 sm:py-8">
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
              <code>VITE_SUPABASE_ANON_KEY</code> with Google OAuth enabled in
              Supabase Auth to sign in.
            </Alert>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={missingLiveSupabase}
            leadingIcon={<GoogleIcon className="h-5 w-5" />}
            onClick={() => void handleGoogleSignIn()}
            className="gap-3 shadow-card hover:border-primary/40"
          >
            {submitting ? "Connecting to Google..." : "Continue with Google"}
          </Button>

          <div className="flex items-start gap-3 rounded-md border border-border bg-canvas p-4">
            <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 text-xs leading-5 text-text-muted">
              <p className="font-semibold text-text">
                {isMockDemo ? "Demo workspace sign-in" : "Invite-only staff access"}
              </p>
              <p className="mt-0.5">
                {isMockDemo
                  ? "Clicking Continue with Google opens the sample hub workspace immediately without leaving this page."
                  : "Public sign-up is disabled. Only Google accounts approved by your hub manager can sign in."}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </AuthLayout>
  );
}
