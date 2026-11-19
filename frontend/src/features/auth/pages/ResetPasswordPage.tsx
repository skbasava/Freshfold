import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
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

const MIN_PASSWORD_LENGTH = 8;

export interface ResetPasswordPageProps {
  authService?: AuthService;
}

export function ResetPasswordPage({
  authService,
}: ResetPasswordPageProps = {}) {
  const auth = useOptionalAuth();
  const navigate = useNavigate();
  const resolvedService = authService ?? auth?.authService ?? defaultAuthService;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const errors: { password?: string; confirmPassword?: string } = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords do not match.";
    }

    if (errors.password || errors.confirmPassword) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      const result = await resolvedService.updatePassword(password);
      if (!result.ok) {
        setFormError(
          result.error ??
            "Could not update your password. Request a new reset link and try again.",
        );
        return;
      }

      setUpdated(true);
      if (auth) {
        await auth.refreshSession();
      }
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
            Set a new password
          </CardTitle>
          <CardDescription>
            Choose a strong password for your FreshFold staff account.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {formError ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Update failed</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          {updated ? (
            <div className="flex flex-col gap-4">
              <Alert>
                <CheckCircle2 aria-hidden="true" />
                <AlertTitle>Password updated</AlertTitle>
                <AlertDescription>
                  Your new password is saved. You can now open the workspace.
                </AlertDescription>
              </Alert>
              <Button
                size="lg"
                className="w-full"
                onClick={() => navigate("/", { replace: true })}
              >
                Continue to Dashboard
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <FieldGroup>
                <Field data-invalid={Boolean(fieldErrors.password) || undefined}>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <div className="relative">
                    <Input
                      id="new-password"
                      name="newPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setFieldErrors((prev) => ({
                          ...prev,
                          password: undefined,
                        }));
                        setFormError(null);
                      }}
                      disabled={submitting}
                      aria-invalid={Boolean(fieldErrors.password)}
                      className="h-9 pr-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={submitting}
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" className="size-3.5" />
                      ) : (
                        <Eye aria-hidden="true" className="size-3.5" />
                      )}
                    </Button>
                  </div>
                  <FieldError>{fieldErrors.password}</FieldError>
                </Field>

                <Field
                  data-invalid={
                    Boolean(fieldErrors.confirmPassword) || undefined
                  }
                >
                  <FieldLabel htmlFor="confirm-password">
                    Confirm password
                  </FieldLabel>
                  <Input
                    id="confirm-password"
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter your new password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setFieldErrors((prev) => ({
                        ...prev,
                        confirmPassword: undefined,
                      }));
                      setFormError(null);
                    }}
                    disabled={submitting}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    className="h-9"
                  />
                  <FieldError>{fieldErrors.confirmPassword}</FieldError>
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
                      <span>Saving password...</span>
                    </>
                  ) : (
                    <span>Save new password</span>
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
