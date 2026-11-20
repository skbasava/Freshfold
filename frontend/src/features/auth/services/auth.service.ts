import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { SessionResponse } from "@laundry/contracts";
import {
  clearActiveSessionContext,
  setActiveSessionContext,
} from "@/lib/http/session-store";
import { getSupabaseAuthClient } from "@/lib/supabase/client";
import type {
  AuthActionResult,
  AuthService,
  AuthSession,
  AuthSessionOutcome,
  LoginCredentials,
} from "../types/auth.types";
import { verifyGatewaySession } from "./gateway-session";

export interface SupabaseAuthServiceDeps {
  getClient?: () => SupabaseClient | null;
  fetchImpl?: typeof fetch;
}

function mapSupabaseError(message?: string): string {
  if (!message) {
    return "We could not sign you in. Please try again.";
  }

  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Incorrect email or password. Please check your details and try again.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Your account email is not confirmed yet. Check your inbox or contact your hub manager.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many sign-in attempts. Please wait a moment and try again.";
  }
  if (normalized.includes("same password") || normalized.includes("different from the old")) {
    return "Choose a new password that is different from your previous password.";
  }
  if (normalized.includes("password") && normalized.includes("character")) {
    return "Your password must meet the minimum length requirement (at least 8 characters).";
  }

  return "Unable to complete authentication right now. Please try again or contact your hub manager.";
}

function formatHubName(hubId: string): string {
  return hubId === "hub-1" ? "Main Hub" : hubId;
}

function toAuthSession(
  accessToken: string,
  verified: SessionResponse,
  rcVersion: string,
): AuthSession {
  const tenantId = verified.tenant?.id ?? verified.tenantId ?? verified.hub.tenantId;
  const hubName = verified.hub.name ?? formatHubName(verified.hub.id);
  return {
    accessToken,
    rcVersion,
    tenantEnabled: verified.tenantEnabled ?? true,
    hubEnabled: verified.hubEnabled ?? true,
    tenant: verified.tenant,
    availableHubs: verified.availableHubs,
    user: {
      id: verified.user.id,
      email: verified.user.email,
      displayName: verified.user.displayName,
      role: verified.role,
      hubId: verified.hub.id,
      hubName,
      tenantId,
      tenantName: verified.tenant?.name,
    },
  };
}

function syncStoreFromOutcome(outcome: AuthSessionOutcome): void {
  if (outcome.kind === "authenticated") {
    setActiveSessionContext({
      accessToken: outcome.session.accessToken,
      tenantId: outcome.session.user.tenantId,
      hubId: outcome.session.user.hubId,
      rcVersion: outcome.session.rcVersion,
    });
    return;
  }

  clearActiveSessionContext();
}

export function createSupabaseAuthService(
  deps: SupabaseAuthServiceDeps = {},
): AuthService {
  const getClient = deps.getClient ?? getSupabaseAuthClient;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const inFlightCallbacks = new Map<string, Promise<AuthActionResult>>();

  async function verifySupabaseSession(
    client: SupabaseClient,
    supabaseSession: Session,
    allowRefreshRetry = true,
  ): Promise<AuthSessionOutcome> {
    const verification = await verifyGatewaySession(
      supabaseSession.access_token,
      fetchImpl,
    );

    if (verification.ok) {
      const session = toAuthSession(
        supabaseSession.access_token,
        verification.session,
        verification.rcVersion,
      );
      const outcome: AuthSessionOutcome = { kind: "authenticated", session };
      syncStoreFromOutcome(outcome);
      return outcome;
    }

    if (verification.kind === "unauthorized" && allowRefreshRetry) {
      try {
        const { data, error } = await client.auth.refreshSession();
        if (!error && data.session) {
          return await verifySupabaseSession(client, data.session, false);
        }
      } catch {
        // Fall through to clean local sign-out
      }

      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
      const outcome: AuthSessionOutcome = { kind: "unauthenticated" };
      syncStoreFromOutcome(outcome);
      return outcome;
    }

    if (verification.kind === "unauthorized") {
      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
      const outcome: AuthSessionOutcome = { kind: "unauthenticated" };
      syncStoreFromOutcome(outcome);
      return outcome;
    }

    if (verification.kind === "denied") {
      const outcome: AuthSessionOutcome = {
        kind: "denied",
        code: verification.code,
        message: verification.message,
        email: supabaseSession.user.email,
      };
      syncStoreFromOutcome(outcome);
      return outcome;
    }

    const outcome: AuthSessionOutcome = {
      kind: "error",
      message: verification.message,
    };
    syncStoreFromOutcome(outcome);
    return outcome;
  }

  return {
    async getSession(): Promise<AuthSessionOutcome> {
      const client = getClient();
      if (!client) {
        const outcome: AuthSessionOutcome = { kind: "unauthenticated" };
        syncStoreFromOutcome(outcome);
        return outcome;
      }

      try {
        const { data, error } = await client.auth.getSession();
        if (error || !data.session) {
          const outcome: AuthSessionOutcome = { kind: "unauthenticated" };
          syncStoreFromOutcome(outcome);
          return outcome;
        }
        return await verifySupabaseSession(client, data.session, true);
      } catch {
        const outcome: AuthSessionOutcome = {
          kind: "error",
          message:
            "Unable to verify your session right now. Please check your connection and try again.",
        };
        syncStoreFromOutcome(outcome);
        return outcome;
      }
    },

    async refreshAccessToken(): Promise<string | null> {
      const client = getClient();
      if (!client) {
        return null;
      }
      try {
        const { data, error } = await client.auth.refreshSession();
        if (error || !data.session) {
          clearActiveSessionContext();
          return null;
        }
        setActiveSessionContext({ accessToken: data.session.access_token });
        return data.session.access_token;
      } catch {
        return null;
      }
    },

    onAuthStateChange(
      listener: (outcome: AuthSessionOutcome) => void,
    ): () => void {
      const client = getClient();
      if (!client) {
        return () => {};
      }

      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((event, nextSession) => {
        if (event === "PASSWORD_RECOVERY") {
          clearActiveSessionContext();
          listener({ kind: "password_recovery" });
          return;
        }

        if (event === "SIGNED_OUT" || !nextSession) {
          clearActiveSessionContext();
          listener({ kind: "unauthenticated" });
          return;
        }

        void verifySupabaseSession(client, nextSession, true).then(listener);
      });

      return () => {
        subscription.unsubscribe();
      };
    },

    async signInWithPassword(
      credentials: LoginCredentials,
    ): Promise<AuthActionResult> {
      const client = getClient();
      if (!client) {
        return {
          ok: false,
          error:
            "Supabase authentication is not configured for this environment. Contact your administrator.",
        };
      }

      try {
        const { data, error } = await client.auth.signInWithPassword({
          email: credentials.email.trim(),
          password: credentials.password,
        });

        if (error || !data.session) {
          return { ok: false, error: mapSupabaseError(error?.message) };
        }

        const outcome = await verifySupabaseSession(client, data.session, false);
        if (outcome.kind === "authenticated") {
          return { ok: true };
        }
        if (outcome.kind === "denied" || outcome.kind === "error") {
          return { ok: false, error: outcome.message };
        }
        return {
          ok: false,
          error: "Your session could not be verified. Please try again.",
        };
      } catch {
        return {
          ok: false,
          error:
            "Network error while signing in. Check your connection and try again.",
        };
      }
    },

    async signInWithGoogle(redirectTo?: string): Promise<AuthActionResult> {
      const client = getClient();
      if (!client) {
        return {
          ok: false,
          error:
            "Google sign-in is not configured for this environment. Contact your administrator.",
        };
      }

      try {
        const callbackUrl =
          redirectTo ??
          (typeof window !== "undefined"
            ? `${window.location.origin}/login/callback`
            : undefined);

        const { error } = await client.auth.signInWithOAuth({
          provider: "google",
          options: callbackUrl ? { redirectTo: callbackUrl } : undefined,
        });

        if (error) {
          return { ok: false, error: mapSupabaseError(error.message) };
        }
        return { ok: true };
      } catch {
        return {
          ok: false,
          error:
            "Could not start Google sign-in. Check your connection and try again.",
        };
      }
    },

    async exchangeOAuthCallback(
      callbackUrl?: string,
    ): Promise<AuthActionResult> {
      const client = getClient();
      if (!client) {
        return {
          ok: false,
          error:
            "Supabase authentication is not configured for this environment.",
        };
      }

      const rawUrl =
        callbackUrl ??
        (typeof window !== "undefined" ? window.location.href : "");
      const dedupeKey = rawUrl || "__default_callback__";

      const existingPromise = inFlightCallbacks.get(dedupeKey);
      if (existingPromise) {
        return existingPromise;
      }

      const run = (async (): Promise<AuthActionResult> => {
        try {
          if (rawUrl) {
            const parsed = new URL(rawUrl);
            const errorParam =
              parsed.searchParams.get("error") ??
              new URLSearchParams(parsed.hash.replace(/^#/, "")).get("error");
            const errorDesc =
              parsed.searchParams.get("error_description") ??
              new URLSearchParams(parsed.hash.replace(/^#/, "")).get(
                "error_description",
              );

            if (errorParam) {
              return {
                ok: false,
                error:
                  errorDesc && !errorDesc.toLowerCase().includes("token")
                    ? errorDesc
                    : "Google sign-in was cancelled or failed. Please try again.",
              };
            }

            const code = parsed.searchParams.get("code");
            if (code) {
              const { data: existing } = await client.auth.getSession();
              if (!existing.session) {
                const { error } =
                  await client.auth.exchangeCodeForSession(code);
                if (error) {
                  // Recover gracefully if detectSessionInUrl already consumed the one-time PKCE code
                  const { data: afterAttempt } = await client.auth.getSession();
                  if (!afterAttempt.session) {
                    return {
                      ok: false,
                      error: mapSupabaseError(error.message),
                    };
                  }
                }
              }
            }
          }

          const outcome = await this.getSession();
          if (outcome.kind === "authenticated") {
            return { ok: true };
          }
          if (outcome.kind === "denied" || outcome.kind === "error") {
            return { ok: false, error: outcome.message };
          }
          return {
            ok: false,
            error:
              "We could not complete Google sign-in. Please return to sign in and try again.",
          };
        } catch {
          return {
            ok: false,
            error: "We could not complete Google sign-in. Please try again.",
          };
        } finally {
          inFlightCallbacks.delete(dedupeKey);
        }
      })();

      inFlightCallbacks.set(dedupeKey, run);
      return run;
    },

    async requestPasswordReset(
      email: string,
      redirectTo?: string,
    ): Promise<AuthActionResult> {
      const client = getClient();
      if (!client) {
        return {
          ok: false,
          error:
            "Password reset is not configured for this environment. Contact your administrator.",
        };
      }

      try {
        const target =
          redirectTo ??
          (typeof window !== "undefined"
            ? `${window.location.origin}/reset-password`
            : undefined);

        const { error } = await client.auth.resetPasswordForEmail(
          email.trim(),
          target ? { redirectTo: target } : undefined,
        );

        if (error) {
          const normalized = error.message.toLowerCase();
          if (
            normalized.includes("rate limit") ||
            normalized.includes("too many")
          ) {
            return {
              ok: false,
              error:
                "Too many reset requests. Please wait a few minutes before trying again.",
            };
          }
        }

        // Anti-enumeration: always confirm generically unless rate-limited
        return { ok: true };
      } catch {
        return {
          ok: false,
          error:
            "Network error while requesting a reset link. Check your connection and try again.",
        };
      }
    },

    async updatePassword(newPassword: string): Promise<AuthActionResult> {
      const client = getClient();
      if (!client) {
        return {
          ok: false,
          error:
            "Password update is not configured for this environment. Contact your administrator.",
        };
      }

      try {
        const { error } = await client.auth.updateUser({
          password: newPassword,
        });
        if (error) {
          return { ok: false, error: mapSupabaseError(error.message) };
        }
        return { ok: true };
      } catch {
        return {
          ok: false,
          error:
            "Network error while updating your password. Please try again.",
        };
      }
    },

    async signOut(): Promise<void> {
      clearActiveSessionContext();
      const client = getClient();
      if (!client) {
        return;
      }
      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    },
  };
}

export const defaultAuthService: AuthService = createSupabaseAuthService();
