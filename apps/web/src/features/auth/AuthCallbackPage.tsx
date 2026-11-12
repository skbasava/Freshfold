import { Alert, Button, LoadingState } from "@freshfold/ui";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { AuthLayout } from "./AuthLayout";

function parseOAuthCallbackError(
  search: string,
  hash: string,
): "cancelled" | "failed" | null {
  const queryParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
  const error = queryParams.get("error") ?? hashParams.get("error");
  if (!error) {
    return null;
  }
  return error === "access_denied" ? "cancelled" : "failed";
}

export function AuthCallbackPage() {
  const auth = useAuth();
  const location = useLocation();
  const oauthError = parseOAuthCallbackError(location.search, location.hash);

  if (auth.state.status === "loading") {
    return (
      <AuthLayout>
        <LoadingState
          variant="cards"
          label="Completing Google sign-in"
          description="Checking your FreshFold hub access."
          rows={1}
        />
      </AuthLayout>
    );
  }

  if (auth.state.status === "error") {
    return (
      <AuthLayout>
        <Alert
          tone="danger"
          title="We could not finish signing you in"
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void auth.refresh()}
              >
                Try again
              </Button>
              <Link
                to="/login"
                className="text-sm font-medium text-primary hover:text-primary-hover"
              >
                Back to sign in
              </Link>
            </div>
          }
        >
          {auth.state.message}
        </Alert>
      </AuthLayout>
    );
  }

  if (auth.state.status === "password_recovery") {
    return <Navigate to="/reset-password" replace />;
  }

  if (auth.state.status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return (
    <Navigate
      to="/login"
      state={oauthError ? { oauthError } : undefined}
      replace
    />
  );
}
