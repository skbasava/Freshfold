import { useCallback, useState, type FormEvent } from "react";
import { defaultAuthService } from "../services/auth.service";
import type {
  AuthService,
  AuthSubmittingMode,
  LoginCredentials,
  LoginFieldErrors,
} from "../types/auth.types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginCredentials(
  credentials: LoginCredentials,
): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const trimmedEmail = credentials.email.trim();

  if (!trimmedEmail) {
    errors.email = "Enter your staff email address.";
  } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  if (!credentials.password) {
    errors.password = "Enter your password.";
  }

  return errors;
}

export interface UseLoginFormOptions {
  authService?: AuthService;
  onSuccess?: () => void;
}

export interface UseLoginFormReturn {
  email: string;
  password: string;
  fieldErrors: LoginFieldErrors;
  formError: string | null;
  submittingMode: AuthSubmittingMode;
  isSubmitting: boolean;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  handlePasswordSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleGoogleSignIn: () => Promise<void>;
}

export function useLoginForm({
  authService = defaultAuthService,
  onSuccess,
}: UseLoginFormOptions = {}): UseLoginFormReturn {
  const [email, setEmailState] = useState("");
  const [password, setPasswordState] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submittingMode, setSubmittingMode] =
    useState<AuthSubmittingMode>("idle");

  const setEmail = useCallback((value: string) => {
    setEmailState(value);
    setFieldErrors((prev) =>
      prev.email ? { ...prev, email: undefined } : prev,
    );
    setFormError(null);
  }, []);

  const setPassword = useCallback((value: string) => {
    setPasswordState(value);
    setFieldErrors((prev) =>
      prev.password ? { ...prev, password: undefined } : prev,
    );
    setFormError(null);
  }, []);

  const handlePasswordSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submittingMode !== "idle") {
        return;
      }

      const validationErrors = validateLoginCredentials({ email, password });
      if (validationErrors.email || validationErrors.password) {
        setFieldErrors(validationErrors);
        setFormError(null);
        return;
      }

      setFieldErrors({});
      setFormError(null);
      setSubmittingMode("password");

      try {
        const result = await authService.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (!result.ok) {
          setFormError(
            result.error ?? "We could not sign you in. Please try again.",
          );
          return;
        }

        onSuccess?.();
      } finally {
        setSubmittingMode("idle");
      }
    },
    [authService, email, onSuccess, password, submittingMode],
  );

  const handleGoogleSignIn = useCallback(async () => {
    if (submittingMode !== "idle") {
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSubmittingMode("google");

    try {
      const result = await authService.signInWithGoogle();
      if (!result.ok) {
        setFormError(
          result.error ?? "Could not start Google sign-in. Please try again.",
        );
        return;
      }
      onSuccess?.();
    } finally {
      setSubmittingMode("idle");
    }
  }, [authService, onSuccess, submittingMode]);

  return {
    email,
    password,
    fieldErrors,
    formError,
    submittingMode,
    isSubmitting: submittingMode !== "idle",
    setEmail,
    setPassword,
    handlePasswordSubmit,
    handleGoogleSignIn,
  };
}
