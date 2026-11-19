import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { LoginFieldErrors } from "../types/auth.types";

export interface LoginCredentialsFormProps {
  email: string;
  password: string;
  fieldErrors: LoginFieldErrors;
  loading?: boolean;
  disabled?: boolean;
  forgotPasswordHref?: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function LoginCredentialsForm({
  email,
  password,
  fieldErrors,
  loading = false,
  disabled = false,
  forgotPasswordHref = "/forgot-password",
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginCredentialsFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isFormDisabled = disabled || loading;

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(fieldErrors.email) || undefined}>
          <FieldLabel htmlFor="login-email">Email</FieldLabel>
          <Input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="staff@freshfold.in"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            disabled={isFormDisabled}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={
              fieldErrors.email ? "login-email-error" : undefined
            }
            className="h-9"
          />
          <FieldError id="login-email-error">{fieldErrors.email}</FieldError>
        </Field>

        <Field data-invalid={Boolean(fieldErrors.password) || undefined}>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="login-password">Password</FieldLabel>
            {forgotPasswordHref ? (
              <Link
                to={forgotPasswordHref}
                className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            ) : null}
          </div>

          <div className="relative">
            <Input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              disabled={isFormDisabled}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                fieldErrors.password ? "login-password-error" : undefined
              }
              className="h-9 pr-9"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={isFormDisabled}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-3.5" />
              ) : (
                <Eye aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          </div>
          <FieldError id="login-password-error">
            {fieldErrors.password}
          </FieldError>
        </Field>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isFormDisabled}
        >
          {loading ? (
            <>
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <span>Sign in</span>
          )}
        </Button>
      </FieldGroup>
    </form>
  );
}
