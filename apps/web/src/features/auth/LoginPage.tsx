import { Alert, Button, Card, Input } from "@freshfold/ui";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useApi } from "../../api/context";
import { useAuth } from "../../auth/AuthContext";
import { AuthClientError } from "../../auth/supabase-auth-client";
import { isMockApiError } from "../../mocks/errors";
import { AuthLayout } from "./AuthLayout";

function loginErrorMessage(error: unknown): string {
  if (error instanceof AuthClientError) {
    switch (error.code) {
      case "invalid_credentials":
        return "Email or password is incorrect.";
      case "email_not_confirmed":
        return "Check your email to confirm your account before signing in.";
      case "rate_limited":
        return "Too many attempts. Wait a minute and try again.";
      case "provider_unavailable":
        return "We could not sign you in. Please try again.";
      default:
        return "We could not sign you in. Check your details and try again.";
    }
  }
  if (isMockApiError(error)) {
    switch (error.status) {
      case 401:
        return "Email or password is incorrect.";
      case 403:
        return "This account cannot access this hub.";
      case 429:
        return "Too many attempts. Wait a minute and try again.";
      case 422:
        return "Enter a valid email address and password.";
      default:
        return error.status >= 500
          ? "We could not sign you in. Please try again."
          : "We could not sign you in. Check your details and try again.";
    }
  }
  return "We could not sign you in. Check your connection and try again.";
}

function sessionMessage(reason: "expired" | "revoked" | undefined): string | null {
  if (reason === "expired") {
    return "Your session ended. Please sign in again.";
  }
  if (reason === "revoked") {
    return "Your access has been removed. Ask your manager to restore it.";
  }
  return null;
}

export function LoginPage() {
  const api = useApi();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const notice =
    auth.state.status === "unauthenticated"
      ? sessionMessage(auth.state.reason)
      : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const nextEmailError = email.trim() ? undefined : "Enter your email.";
    const nextPasswordError = password ? undefined : "Enter your password.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      return;
    }

    setSubmitting(true);
    try {
      await auth.login({ email: email.trim(), password });
      const from =
        (location.state as { from?: { pathname?: string; search?: string } } | null)
          ?.from;
      navigate(from?.pathname ? `${from.pathname}${from.search ?? ""}` : "/", {
        replace: true,
      });
    } catch (caught) {
      setError(loginErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <Card
        title="Sign in to FreshFold"
        description="Use the account given to you by your manager."
      >
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {notice ? <Alert tone="warning" title={notice} /> : null}
          {error ? <Alert tone="danger" title={error} /> : null}

          <Input
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
            required
          />

          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={passwordError}
            required
          />

          <Button type="submit" fullWidth loading={submitting}>
            Sign in
          </Button>

          <Link
            to="/forgot-password"
            className="text-center text-sm font-medium text-primary hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Forgot password?
          </Link>

          {api.mode === "mock" && auth.authProvider === "legacy" ? (
            <p className="text-center text-xs leading-5 text-text-muted">
              Demo mode: any email and password sign you in to sample data.
            </p>
          ) : null}
        </form>
      </Card>
    </AuthLayout>
  );
}
