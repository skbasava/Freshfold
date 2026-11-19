import { useCallback } from "react";
import { AuthShell } from "@/components/blocks";
import { AuthBrandPanel, LoginCardBlock } from "../components";
import { useOptionalAuth } from "../context/AuthContext";
import { useLoginForm } from "../hooks/useLoginForm";
import type { AuthService } from "../types/auth.types";

export interface LoginPageProps {
  authService?: AuthService;
  onLoginSuccess?: () => void;
}

export function LoginPage({ authService, onLoginSuccess }: LoginPageProps) {
  const authContext = useOptionalAuth();
  const resolvedAuthService = authService ?? authContext?.authService;

  const handleSuccess = useCallback(() => {
    if (authContext) {
      void authContext.refreshSession();
    }
    onLoginSuccess?.();
  }, [authContext, onLoginSuccess]);

  const {
    email,
    password,
    fieldErrors,
    formError,
    submittingMode,
    setEmail,
    setPassword,
    handlePasswordSubmit,
    handleGoogleSignIn,
  } = useLoginForm({
    authService: resolvedAuthService,
    onSuccess: handleSuccess,
  });

  return (
    <AuthShell
      aside={<AuthBrandPanel />}
    >
      <LoginCardBlock
        email={email}
        password={password}
        fieldErrors={fieldErrors}
        formError={formError}
        submittingMode={submittingMode}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onPasswordSubmit={handlePasswordSubmit}
        onGoogleSignIn={handleGoogleSignIn}
      />
    </AuthShell>
  );
}
