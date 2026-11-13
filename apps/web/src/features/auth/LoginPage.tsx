
import {
  Alert,
  Badge,
  Button,
  Card,
  GoogleIcon,
} from "@freshfold/ui";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from "framer-motion";

import { useApi } from "../../api/context";
import { useAuth } from "../../auth/AuthContext";
import { AuthClientError } from "../../auth/supabase-auth-client";
import { isMockApiError } from "../../mocks/errors";
import { AuthLayout } from "./AuthLayout";

type OAuthErrorReason = "cancelled" | "failed";

interface LoginLocationState {
  oauthError?: OAuthErrorReason;
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof AuthClientError) {
    switch (error.code) {
      case "oauth_denied":
        return "Google sign-in was cancelled. Try again when you are ready.";
      case "rate_limited":
        return "Too many sign-in attempts. Wait a minute and try again.";
      case "provider_unavailable":
        return "Google sign-in is unavailable right now. Please try again.";
      default:
        return "We could not complete Google sign-in. Please try again.";
    }
  }

  if (isMockApiError(error)) {
    switch (error.status) {
      case 403:
        return "This Google account cannot access this hub.";
      case 429:
        return "Too many sign-in attempts. Wait a minute and try again.";
      default:
        return "We could not complete Google sign-in. Please try again.";
    }
  }

  return "We could not connect to Google sign-in. Check your connection and try again.";
}

function sessionNotice(
  reason: "expired" | "revoked" | undefined,
): { tone: "warning" | "danger"; message: string } | null {
  if (reason === "expired") {
    return {
      tone: "warning",
      message: "Your session ended. Please sign in again.",
    };
  }

  if (reason === "revoked") {
    return {
      tone: "danger",
      message:
        "Your access has been removed or is not enabled. Ask your manager to restore it.",
    };
  }

  return null;
}

function oauthCallbackNotice(
  oauthError: OAuthErrorReason | undefined,
): { tone: "warning" | "danger"; message: string } | null {
  if (oauthError === "cancelled") {
    return {
      tone: "warning",
      message: "Google sign-in was cancelled. Try again when you are ready.",
    };
  }

  if (oauthError === "failed") {
    return {
      tone: "danger",
      message:
        "We could not complete Google sign-in. Ask your hub manager if you still need access.",
    };
  }

  return null;
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const cardVariants = {
  hidden: {
    opacity: 0,
    y: 24,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

const itemVariants = {
  hidden: {
    opacity: 0,
    y: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: "easeOut" as const,
    },
  },
};

export function LoginPage() {
  const api = useApi();
  const auth = useAuth();
  const location = useLocation();

  const shouldReduceMotion = useReducedMotion();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sessionAlert =
    auth.state.status === "unauthenticated"
      ? sessionNotice(auth.state.reason)
      : null;

  const callbackAlert = oauthCallbackNotice(
    (location.state as LoginLocationState | null)?.oauthError,
  );

  const isMockDemo =
    api.mode === "mock" && auth.authProvider === "mock";

  const missingLiveSupabase =
    api.mode === "live" && auth.authProvider !== "supabase";

  const hasNotices = Boolean(
    sessionAlert || callbackAlert || error || missingLiveSupabase,
  );

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);

    try {
      await auth.loginWithGoogle();
    } catch (caught) {
      setError(loginErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <motion.div
        className="mx-auto w-full"
        initial={shouldReduceMotion ? false : "hidden"}
        animate="visible"
        variants={containerVariants}
      >
        {/* Login card */}
        <motion.div variants={cardVariants}>
          <Card
            padding="none"
            className="overflow-hidden rounded-[24px] border border-[#E7EBE2] bg-white shadow-[0_16px_60px_rgba(38,58,32,0.07)]"
          >
            <div className="p-6 sm:p-10">

              {/* Heading */}
              <motion.div
                className="mb-8 text-center"
                variants={itemVariants}
              >
                <h1 className="text-3xl font-bold tracking-[-0.05em] text-[#202A20] sm:text-[34px]">
                  Welcome back.
                </h1>

                <p className="mt-3 text-sm leading-6 text-[#858D80]">
                  Everything starts with a simple sign in.
                </p>
              </motion.div>

              {/* Notifications */}
              <AnimatePresence mode="wait">
                {hasNotices && (
                  <motion.div
                    key="login-notices"
                    initial={
                      shouldReduceMotion
                        ? false
                        : { opacity: 0, y: -8 }
                    }
                    animate={{
                      opacity: 1,
                      y: 0,
                      height: "auto",
                    }}
                    exit={
                      shouldReduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: -8 }
                    }
                    transition={{ duration: 0.25 }}
                    className="mb-5 flex flex-col gap-3 overflow-hidden"
                  >
                    {sessionAlert && (
                      <Alert
                        tone={sessionAlert.tone}
                        title={sessionAlert.message}
                      />
                    )}

                    {callbackAlert && (
                      <Alert
                        tone={callbackAlert.tone}
                        title={callbackAlert.message}
                      />
                    )}

                    {error && (
                      <Alert
                        tone="danger"
                        title={error}
                      />
                    )}

                    {missingLiveSupabase && (
                      <Alert
                        tone="warning"
                        title="Google sign-in is not configured in this environment."
                      >
                        Add <code>VITE_SUPABASE_URL</code> and{" "}
                        <code>VITE_SUPABASE_ANON_KEY</code> with Google
                        OAuth enabled in Supabase Auth to sign in.
                      </Alert>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Google sign-in */}
              <motion.div variants={itemVariants}>
                <motion.div
                  whileHover={
                    shouldReduceMotion || submitting || missingLiveSupabase
                      ? undefined
                      : { y: -3 }
                  }
                  whileTap={
                    shouldReduceMotion || submitting || missingLiveSupabase
                      ? undefined
                      : { scale: 0.985 }
                  }
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 22,
                  }}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    fullWidth
                    loading={submitting}
                    disabled={missingLiveSupabase}
                    leadingIcon={
                      <GoogleIcon className="h-5 w-5 shrink-0" />
                    }
                    onClick={() => void handleGoogleSignIn()}
                    className="h-[56px] gap-3 rounded-xl border border-[#243B2B] bg-[#243B2B] text-sm font-semibold shadow-sm transition-colors hover:border-[#304E38] hover:bg-[#304E38] focus-visible:ring-2 focus-visible:ring-[#83AC42] focus-visible:ring-offset-2"
                  >
                    {submitting
                      ? "Connecting to Google..."
                      : "Continue with Google"}
                  </Button>
                </motion.div>
              </motion.div>

              {/* Demo badge */}
              <AnimatePresence>
                {isMockDemo && (
                  <motion.div
                    initial={
                      shouldReduceMotion
                        ? false
                        : { opacity: 0, y: 8, scale: 0.96 }
                    }
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mt-5 flex justify-center"
                  >
                    <Badge tone="primary" dot>
                      Demo mode
                    </Badge>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </Card>
        </motion.div>

        {/* Support text */}
        <motion.div
          className="mt-7 text-center"
          variants={itemVariants}
        >
          <p className="text-sm text-[#92998D]">
            Don't have access?{" "}
            <span className="font-semibold text-[#527C37]">
              Contact your manager.
            </span>
          </p>
        </motion.div>
      </motion.div>
    </AuthLayout>
  );
}
