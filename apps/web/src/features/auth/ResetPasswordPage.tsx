import { Alert, Button, Card, Input, LoadingState } from "@freshfold/ui";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { AuthClientError } from "../../auth/supabase-auth-client";
import { AuthLayout } from "./AuthLayout";

function describePasswordError(error: unknown): string {
  if (error instanceof AuthClientError && error.code === "weak_password") {
    return "Choose a stronger password with at least 8 characters.";
  }
  return "We could not update your password. Request a new reset link.";
}

export function ResetPasswordPage() {
  const auth = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmationError, setConfirmationError] = useState<
    string | undefined
  >();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (auth.state.status === "loading") {
    return (
      <AuthLayout>
        <LoadingState label="Checking your reset link" rows={2} />
      </AuthLayout>
    );
  }

  const canSetPassword =
    done ||
    auth.state.status === "password_recovery" ||
    auth.state.status === "authenticated";

  if (!canSetPassword) {
    return (
      <AuthLayout>
        <Card title="Set your password">
          <Alert tone="danger" title="This link is not valid or has expired.">
            Ask your manager for a new invitation, or request another password
            reset link.
          </Alert>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-primary hover:text-primary-hover"
            >
              Request a new reset link
            </Link>
            <Link
              to="/login"
              className="text-sm font-medium text-primary hover:text-primary-hover"
            >
              Back to sign in
            </Link>
          </div>
        </Card>
      </AuthLayout>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const nextPasswordError =
      password.length >= 8 ? undefined : "Use at least 8 characters.";
    const nextConfirmationError =
      confirmation === password ? undefined : "Passwords do not match.";
    setPasswordError(nextPasswordError);
    setConfirmationError(nextConfirmationError);
    if (nextPasswordError || nextConfirmationError) {
      return;
    }

    setSubmitting(true);
    try {
      await auth.setPassword(password);
      setDone(true);
    } catch (caught) {
      setError(describePasswordError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <Card
        title="Set your password"
        description="Choose a password you have not used before."
      >
        {done ? (
          <div className="flex flex-col gap-4">
            <Alert tone="success" title="Your password is set.">
              You can now use it to sign in to FreshFold.
            </Alert>
            <Link
              to="/"
              className="text-center text-sm font-medium text-primary hover:text-primary-hover"
            >
              Continue to workspace
            </Link>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            {error ? <Alert tone="danger" title={error} /> : null}

            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={passwordError}
              required
            />

            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              error={confirmationError}
              required
            />

            <Button type="submit" fullWidth loading={submitting}>
              Save password
            </Button>
          </form>
        )}
      </Card>
    </AuthLayout>
  );
}
