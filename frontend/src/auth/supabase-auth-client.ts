import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  defaultOAuthCallbackUrl,
  type SupabaseAuthConfig,
} from "./supabase-config";
import type {
  AuthClient,
  AuthClientErrorCode,
  AuthClientSession,
  AuthLifecycleEvent,
  AuthStateChange,
} from "./types";

export interface SupabaseSessionLike {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | null;
  user: {
    id: string;
    email?: string | null;
  };
}

interface SupabaseAuthErrorLike {
  message?: string;
  status?: number;
  code?: string;
}

interface SupabaseResponse<T> {
  data: T;
  error: SupabaseAuthErrorLike | null;
}

export interface SupabaseAuthLike {
  auth: {
    getSession(): Promise<
      SupabaseResponse<{ session: SupabaseSessionLike | null }>
    >;
    signInWithPassword(input: {
      email: string;
      password: string;
    }): Promise<
      SupabaseResponse<{
        session: SupabaseSessionLike | null;
        user: SupabaseSessionLike["user"] | null;
      }>
    >;
    signInWithOAuth(input: {
      provider: "google";
      options?: {
        redirectTo?: string;
        queryParams?: Record<string, string>;
      };
    }): Promise<
      SupabaseResponse<{
        provider: string;
        url: string | null;
      }>
    >;
    signOut(): Promise<{ error: SupabaseAuthErrorLike | null }>;
    resetPasswordForEmail(
      email: string,
      options?: { redirectTo?: string },
    ): Promise<SupabaseResponse<unknown>>;
    updateUser(attributes: {
      password: string;
    }): Promise<SupabaseResponse<{ user: SupabaseSessionLike["user"] | null }>>;
    refreshSession(): Promise<
      SupabaseResponse<{ session: SupabaseSessionLike | null }>
    >;
    onAuthStateChange(
      callback: (
        event: string,
        session: SupabaseSessionLike | null,
      ) => void,
    ): { data: { subscription: { unsubscribe(): void } } };
  };
}

export class AuthClientError extends Error {
  readonly code: AuthClientErrorCode;

  constructor(code: AuthClientErrorCode, message: string) {
    super(message);
    this.name = "AuthClientError";
    this.code = code;
  }
}

function mapError(error: SupabaseAuthErrorLike | null): AuthClientError {
  if (!error) {
    return new AuthClientError(
      "provider_unavailable",
      "The sign-in service is unavailable.",
    );
  }

  const message = error.message ?? "Authentication failed.";
  const code = error.code?.toLowerCase() ?? "";
  const status = error.status ?? 0;

  if (status === 429 || code.includes("rate")) {
    return new AuthClientError(
      "rate_limited",
      "Too many attempts. Wait a minute and try again.",
    );
  }
  if (code.includes("weak_password")) {
    return new AuthClientError(
      "weak_password",
      "Choose a stronger password with at least 8 characters.",
    );
  }
  if (code.includes("email_not_confirmed")) {
    return new AuthClientError(
      "email_not_confirmed",
      "Check your email to confirm your account before signing in.",
    );
  }
  if (
    code.includes("access_denied") ||
    /access_denied/i.test(message)
  ) {
    return new AuthClientError(
      "oauth_denied",
      "Google sign-in was cancelled. Try again when you are ready.",
    );
  }
  if (
    code.includes("invalid_credentials") ||
    code.includes("invalid_grant") ||
    /invalid login credentials/i.test(message)
  ) {
    return new AuthClientError(
      "invalid_credentials",
      "Email or password is incorrect.",
    );
  }

  return new AuthClientError("provider_unavailable", message);
}

function mapSession(
  session: SupabaseSessionLike | null,
): AuthClientSession | null {
  if (!session) {
    return null;
  }
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token ?? null,
    expiresAt: session.expires_at ?? null,
    userId: session.user.id,
    email: session.user.email ?? null,
  };
}

function mapEvent(event: string): AuthLifecycleEvent | null {
  switch (event) {
    case "INITIAL_SESSION":
      return "initial_session";
    case "SIGNED_IN":
      return "signed_in";
    case "SIGNED_OUT":
      return "signed_out";
    case "TOKEN_REFRESHED":
      return "token_refreshed";
    case "PASSWORD_RECOVERY":
      return "password_recovery";
    case "USER_UPDATED":
      return "user_updated";
    default:
      return null;
  }
}

type CreateClientLike = (
  url: string,
  key: string,
  options: SupabaseAuthConfig["auth"],
) => SupabaseClient;

export function createSupabaseAuthClient(
  config: SupabaseAuthConfig,
  supabase?: SupabaseAuthLike,
  createClientImpl: CreateClientLike = createClient as unknown as CreateClientLike,
): AuthClient {
  let client: SupabaseAuthLike;
  try {
    client =
      supabase ??
      (createClientImpl(config.url, config.anonKey, config.auth) as unknown as
        | SupabaseAuthLike
        | null) ??
      (() => {
        throw new Error("Supabase client is unavailable");
      })();
  } catch (error) {
    throw new AuthClientError(
      "provider_unavailable",
      error instanceof Error
        ? error.message
        : "The sign-in service is unavailable.",
    );
  }

  return {
    provider: "supabase",

    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) {
        throw mapError(error);
      }
      return mapSession(data.session);
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        throw mapError(error);
      }
      if (!data.session) {
        throw new AuthClientError(
          "provider_unavailable",
          "The sign-in service did not return a session.",
        );
      }
    },

    async signInWithGoogle(redirectTo) {
      const targetRedirect = redirectTo ?? defaultOAuthCallbackUrl();
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          ...(targetRedirect ? { redirectTo: targetRedirect } : {}),
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) {
        throw mapError(error);
      }
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      // Local session state is cleared by the provider regardless of network
      // failures, so a sign-out error must not keep a stale session usable.
      if (error) {
        return;
      }
    },

    async requestPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        ...(config.redirectUrl ? { redirectTo: config.redirectUrl } : {}),
      });
      if (error) {
        throw mapError(error);
      }
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        throw mapError(error);
      }
    },

    async refreshSession() {
      const { data, error } = await client.auth.refreshSession();
      if (error) {
        return null;
      }
      return mapSession(data.session);
    },

    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const mapped = mapEvent(event);
        if (!mapped) {
          return;
        }
        const change: AuthStateChange = {
          event: mapped,
          session: mapSession(session),
        };
        listener(change);
      });

      return {
        unsubscribe() {
          data.subscription.unsubscribe();
        },
      };
    },
  };
}
