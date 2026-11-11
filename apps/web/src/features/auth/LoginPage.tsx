import {
  Alert,
  Button,
  Card,
  Input,
  SparkleIcon,
} from "@freshfold/ui";
import { useState, type FormEvent } from "react";
import { useApi } from "../../api/context";
import { useAuth } from "../../auth/AuthContext";
import { isMockApiError } from "../../mocks/errors";

function loginErrorMessage(error: unknown): string {
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

export function LoginPage() {
  const api = useApi();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    } catch (caught) {
      setError(loginErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-primary text-surface shadow-card">
            <SparkleIcon className="h-5 w-5" />
          </span>
          <span className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight text-text">
              FreshFold
            </span>
            <span className="text-xs text-text-muted">Laundry workspace</span>
          </span>
        </div>

        <Card
          title="Sign in to FreshFold"
          description="Use the account given to you by your manager."
        >
          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            {error ? (
              <Alert tone="danger" title={error} />
            ) : null}

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

            {api.mode === "mock" ? (
              <p className="text-center text-xs leading-5 text-text-muted">
                Demo mode: any email and password sign you in to sample data.
              </p>
            ) : null}
          </form>
        </Card>
      </div>
    </main>
  );
}
