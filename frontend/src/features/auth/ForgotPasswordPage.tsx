import { Alert, Button, Card, Input } from "@freshfold/ui";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { AuthLayout } from "./AuthLayout";

export function ForgotPasswordPage() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const nextEmailError = email.trim() ? undefined : "Enter your email.";
    setEmailError(nextEmailError);
    if (nextEmailError) {
      return;
    }

    setSubmitting(true);
    try {
      await auth.requestPasswordReset(email.trim());
      setSent(true);
    } catch {
      setError("We could not send the reset link. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <Card
        title="Reset your password"
        description="We will email you a secure link to choose a new password."
      >
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {sent ? (
            <Alert tone="success" title="Your reset link is on its way.">
              If that email belongs to a staff account, a reset link is on its
              way.
            </Alert>
          ) : null}
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

          <Button type="submit" fullWidth loading={submitting}>
            Send reset link
          </Button>

          <Link
            to="/login"
            className="rounded text-center text-sm font-medium text-accent-strong hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Back to sign in
          </Link>
        </form>
      </Card>
    </AuthLayout>
  );
}
