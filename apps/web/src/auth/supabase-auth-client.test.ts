import { describe, expect, it, vi } from "vitest";
import {
  AuthClientError,
  createSupabaseAuthClient,
  type SupabaseAuthLike,
} from "./supabase-auth-client";

const config = {
  url: "https://project.supabase.co",
  anonKey: "anon-key",
  redirectUrl: "http://localhost:5173/reset-password",
  auth: {
    flowType: "pkce" as const,
    detectSessionInUrl: true as const,
    persistSession: true as const,
    autoRefreshToken: true as const,
  },
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: 1_800_000_000,
    user: { id: "supabase-user-1", email: "desk@example.com" },
    ...overrides,
  };
}

function fakeSupabase(
  overrides: Partial<SupabaseAuthLike["auth"]> = {},
): SupabaseAuthLike {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: session() }, error: null })),
      signInWithPassword: vi.fn(async () => ({
        data: { session: session(), user: session().user },
        error: null,
      })),
      signInWithOAuth: vi.fn(async () => ({
        data: { provider: "google", url: "https://accounts.google.com/o/oauth2/v2/auth" },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
      updateUser: vi.fn(async () => ({ data: { user: session().user }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: session() }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      ...overrides,
    } as SupabaseAuthLike["auth"],
  };
}

describe("Supabase auth client adapter", () => {
  it("restores an existing session and maps only the public token fields", async () => {
    const supabase = fakeSupabase();
    const client = createSupabaseAuthClient(config, supabase);

    await expect(client.getSession()).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 1_800_000_000,
      userId: "supabase-user-1",
      email: "desk@example.com",
    });
  });

  it("signs in with a password and reports invalid credentials", async () => {
    const signIn = vi.fn(async () => ({
      data: { session: null, user: null },
      error: {
        message: "Invalid login credentials",
        status: 400,
        code: "invalid_credentials",
      },
    }));
    const client = createSupabaseAuthClient(
      config,
      fakeSupabase({ signInWithPassword: signIn }),
    );

    await expect(client.signIn("desk@example.com", "wrong")).rejects.toMatchObject({
      name: "AuthClientError",
      code: "invalid_credentials",
    });
    expect(signIn).toHaveBeenCalledWith({
      email: "desk@example.com",
      password: "wrong",
    });
  });

  it("starts Google OAuth PKCE flow with account selection and callback URL", async () => {
    const signInWithOAuth = vi.fn(async () => ({
      data: {
        provider: "google",
        url: "https://accounts.google.com/o/oauth2/v2/auth",
      },
      error: null,
    }));
    const client = createSupabaseAuthClient(
      config,
      fakeSupabase({ signInWithOAuth }),
    );

    await client.signInWithGoogle("http://localhost:5173/login/callback");

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:5173/login/callback",
        queryParams: {
          prompt: "select_account",
        },
      },
    });
  });

  it("maps cancelled Google OAuth errors to oauth_denied", async () => {
    const signInWithOAuth = vi.fn(async () => ({
      data: { provider: "google", url: null },
      error: {
        message: "access_denied",
        status: 400,
        code: "access_denied",
      },
    }));
    const client = createSupabaseAuthClient(
      config,
      fakeSupabase({ signInWithOAuth }),
    );

    await expect(
      client.signInWithGoogle("http://localhost:5173/login/callback"),
    ).rejects.toMatchObject({
      name: "AuthClientError",
      code: "oauth_denied",
    });
  });

  it("requests a password reset with the configured redirect URL", async () => {
    const resetPasswordForEmail = vi.fn(async () => ({ data: {}, error: null }));
    const client = createSupabaseAuthClient(
      config,
      fakeSupabase({ resetPasswordForEmail }),
    );

    await client.requestPasswordReset("desk@example.com");

    expect(resetPasswordForEmail).toHaveBeenCalledWith("desk@example.com", {
      redirectTo: "http://localhost:5173/reset-password",
    });
  });

  it("sets a new password for an invited or recovering employee", async () => {
    const updateUser = vi.fn(async () => ({
      data: { user: session().user },
      error: null,
    }));
    const client = createSupabaseAuthClient(
      config,
      fakeSupabase({ updateUser }),
    );

    await client.updatePassword("new strong password");

    expect(updateUser).toHaveBeenCalledWith({ password: "new strong password" });
  });

  it("surfaces an AuthClientError when session refresh fails", async () => {
    const client = createSupabaseAuthClient(
      config,
      fakeSupabase({
        refreshSession: vi.fn(async () => ({
          data: { session: null },
          error: { message: "Refresh token revoked", status: 400 },
        })),
      }),
    );

    await expect(client.refreshSession()).resolves.toBeNull();
  });

  it("translates Supabase auth events and unsubscribes", () => {
    const unsubscribe = vi.fn();
    let handler: ((event: string, next: unknown) => void) | undefined;
    const client = createSupabaseAuthClient(
      config,
      fakeSupabase({
        onAuthStateChange: vi.fn((callback) => {
          handler = callback as typeof handler;
          return { data: { subscription: { unsubscribe } } };
        }),
      }),
    );
    const listener = vi.fn();
    const subscription = client.onAuthStateChange(listener);

    handler?.("PASSWORD_RECOVERY", session());
    handler?.("TOKEN_REFRESHED", session({ access_token: "access-token-2" }));

    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      event: "password_recovery",
    });
    expect(listener.mock.calls[1]?.[0]).toMatchObject({
      event: "token_refreshed",
      session: { accessToken: "access-token-2" },
    });

    subscription.unsubscribe();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the Supabase client cannot be created", () => {
    expect(() =>
      createSupabaseAuthClient(config, undefined, () => {
        throw new Error("bad project URL");
      }),
    ).toThrow(AuthClientError);
  });
});
