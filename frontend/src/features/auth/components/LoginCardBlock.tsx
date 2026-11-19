import type { FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldSeparator } from "@/components/ui/field";
import type {
  AuthSubmittingMode,
  LoginFieldErrors,
} from "../types/auth.types";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { LoginCredentialsForm } from "./LoginCredentialsForm";

export interface LoginCardBlockProps {
  email: string;
  password: string;
  fieldErrors: LoginFieldErrors;
  formError: string | null;
  submittingMode: AuthSubmittingMode;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn: () => void;
}

export function LoginCardBlock({
  email,
  password,
  fieldErrors,
  formError,
  submittingMode,
  onEmailChange,
  onPasswordChange,
  onPasswordSubmit,
  onGoogleSignIn,
}: LoginCardBlockProps) {
  const isBusy = submittingMode !== "idle";

  return (
    <Card className="w-full shadow-none ring-0 bg-transparent [--card-spacing:--spacing(6)]">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-semibold tracking-tight">
          Sign in to FreshFold
        </CardTitle>
        <CardDescription>
          Access your hub&apos;s orders, customers, and daily deliveries.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {formError ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <GoogleSignInButton
          loading={submittingMode === "google"}
          disabled={isBusy}
          onClick={onGoogleSignIn}
        />

        <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
          Or continue with email
        </FieldSeparator>

        <LoginCredentialsForm
          email={email}
          password={password}
          fieldErrors={fieldErrors}
          loading={submittingMode === "password"}
          disabled={isBusy}
          onEmailChange={onEmailChange}
          onPasswordChange={onPasswordChange}
          onSubmit={onPasswordSubmit}
        />

        <p className="text-center text-xs text-muted-foreground">
          Need staff access? Ask your hub manager to invite your account.
        </p>
      </CardContent>

    </Card>
  );
}
