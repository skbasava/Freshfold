import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/blocks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthBrandPanel } from "../components/AuthBrandPanel";
import { useOptionalAuth } from "../context/AuthContext";
import { defaultAuthService } from "../services/auth.service";
import type { AuthService } from "../types/auth.types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ForgotPasswordPageProps {
  authService?: AuthService;
}

export function ForgotPasswordPage({
  authService,
}: ForgotPasswordPageProps = {}) {
  const auth = useOptionalAuth();
  const resolvedService = authService ?? auth?.authService ?? defaultAuthService;

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError("Enter your staff email address.");
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }

    setEmailError(undefined);
    setFormError(null);
    setSubmitting(true);

    try {
      const result = await resolvedService.requestPasswordReset(trimmed);
      if (!result.ok) {
        setFormError(
          result.error ??
            "Unable to send reset instructions right now. Please try again.",
        );
        return;
      }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      aside={<AuthBrandPanel />}
    >
      <Card className="w-full shadow-sm [--card-spacing:--spacing(6)]">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold tracking-tight">
            Reset your password
          </CardTitle>
          <CardDescription>
            Enter your staff email and we&apos;ll send a secure password reset
            link.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {formError ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Request failed</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          {submitted ? (
            <Alert>
              <CheckCircle2 aria-hidden="true" />
              <AlertTitle>Check your inbox</AlertTitle>
              <AlertDescription>
                If an active FreshFold account matches that email, we&apos;ve
                sent a password reset link.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <FieldGroup>
                <Field data-invalid={Boolean(emailError) || undefined}>
                  <FieldLabel htmlFor="reset-request-email">Email</FieldLabel>
                  <Input
                    id="reset-request-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="staff@freshfold.in"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setEmailError(undefined);
                      setFormError(null);
                    }}
                    disabled={submitting}
                    aria-invalid={Boolean(emailError)}
                    className="h-9"
                  />
                  <FieldError>{emailError}</FieldError>
                </Field>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                      <span>Sending reset link...</span>
                    </>
                  ) : (
                    <span>Send reset link</span>
                  )}
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>

        <CardFooter className="justify-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            <span>Back to sign in</span>
          </Link>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
