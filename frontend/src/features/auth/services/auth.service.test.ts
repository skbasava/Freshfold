import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearActiveSessionContext,
  getActiveSessionContext,
} from "@/lib/http/session-store";
import { createSupabaseAuthService } from "./auth.service";

function makeSupabaseSession(
  accessToken = "jwt-token-1",
  overrides: Partial<Session> = {},
): Session {
  return {
    access_token: accessToken,
    refresh_token: "refresh-token-1",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-123",
      email: "staff@freshfold.in",
      app_metadata: {},
      // Deliberately malicious client-editable metadata that must NEVER be trusted
      user_metadata: { role: "super_admin", tenant_id: "evil-tenant" },
      aud: "authenticated",
      created_at: new Date().toISOString(),
    },
    ...overrides,
  } as Session;
}

function makeFakeSupabaseClient(
  overrides: Partial<SupabaseClient["auth"]> = {},
): SupabaseClient {
  const auth = {
    getSession: vi.fn().mockResolvedValue({
      data: { session: makeSupabaseSession() },
      error: null,
    }),
    refreshSession: vi.fn().mockResolvedValue({
      data: { session: makeSupabaseSession("jwt-token-refreshed") },
      error: null,
    }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { session: makeSupabaseSession() },
      error: null,
    }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({
      data: { session: makeSupabaseSession() },
      error: null,
    }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
    ...overrides,
  };
  return { auth } as unknown as SupabaseClient;
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("createSupabaseAuthService (ADR-015 secure verification)", () => {
  beforeEach(() => {
    clearActiveSessionContext();
  });

  it("verifies session via Gateway GET /api/me and ignores client user_metadata", async () => {
    const client = makeFakeSupabaseClient();
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          user: {
            id: "user-123",
            email: "staff@freshfold.in",
            displayName: "Aarav Front Desk",
          },
          hub: { id: "hub-1", tenantId: "tenant-1" },
          role: "front_desk",
          tenantId: "tenant-1",
          tenantEnabled: false,
          hubEnabled: false,
        },
        200,
        { "x-rc-version": "2.4.0" },
      ),
    );

    const service = createSupabaseAuthService({
      getClient: () => client,
      fetchImpl,
    });

    const outcome = await service.getSession();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/me");
    expect((init.headers as Headers).get("Authorization")).toBe(
      "Bearer jwt-token-1",
    );

    expect(outcome.kind).toBe("authenticated");
    if (outcome.kind === "authenticated") {
      // Server-verified role & tenant win over spoofed user_metadata
      expect(outcome.session.user.role).toBe("front_desk");
      expect(outcome.session.user.tenantId).toBe("tenant-1");
      expect(outcome.session.rcVersion).toBe("2.4.0");
    }

    expect(getActiveSessionContext()).toEqual({
      accessToken: "jwt-token-1",
      tenantId: "tenant-1",
      hubId: "hub-1",
      rcVersion: "2.4.0",
    });
  });

  it("fails closed with denied outcome when Gateway returns 403 membership_missing", async () => {
    const client = makeFakeSupabaseClient();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "membership_missing" }, 403));

    const service = createSupabaseAuthService({
      getClient: () => client,
      fetchImpl,
    });

    const outcome = await service.getSession();

    expect(outcome.kind).toBe("denied");
    if (outcome.kind === "denied") {
      expect(outcome.code).toBe("membership_missing");
    }
    expect(getActiveSessionContext().accessToken).toBeNull();
  });

  it("fails closed with denied outcome when Gateway returns 403 membership_inactive", async () => {
    const client = makeFakeSupabaseClient();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "membership_inactive" }, 403));

    const service = createSupabaseAuthService({
      getClient: () => client,
      fetchImpl,
    });

    const outcome = await service.getSession();

    expect(outcome.kind).toBe("denied");
    if (outcome.kind === "denied") {
      expect(outcome.code).toBe("membership_inactive");
    }
  });

  it("refreshes Supabase token once on 401 and succeeds on retry", async () => {
    const client = makeFakeSupabaseClient();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired_session" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          user: {
            id: "user-123",
            email: "staff@freshfold.in",
            displayName: "Refreshed Staff",
          },
          hub: { id: "hub-1", tenantId: "tenant-1" },
          role: "manager",
        }),
      );

    const service = createSupabaseAuthService({
      getClient: () => client,
      fetchImpl,
    });

    const outcome = await service.getSession();

    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(outcome.kind).toBe("authenticated");
    if (outcome.kind === "authenticated") {
      expect(outcome.session.accessToken).toBe("jwt-token-refreshed");
      expect(outcome.session.user.role).toBe("manager");
    }
  });

  it("signs out locally when 401 refresh also fails", async () => {
    const client = makeFakeSupabaseClient({
      refreshSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: new Error("refresh_failed"),
      }),
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "invalid_token" }, 401));

    const service = createSupabaseAuthService({
      getClient: () => client,
      fetchImpl,
    });

    const outcome = await service.getSession();

    expect(outcome).toEqual({ kind: "unauthenticated" });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("exchanges PKCE OAuth code on callback and verifies /api/me", async () => {
    const client = makeFakeSupabaseClient({
      getSession: vi
        .fn()
        .mockResolvedValueOnce({ data: { session: null }, error: null })
        .mockResolvedValueOnce({
          data: { session: makeSupabaseSession("pkce-jwt") },
          error: null,
        }),
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        user: {
          id: "user-123",
          email: "staff@freshfold.in",
          displayName: "Google Staff",
        },
        hub: { id: "hub-1", tenantId: "tenant-1" },
        role: "manager",
      }),
    );

    const service = createSupabaseAuthService({
      getClient: () => client,
      fetchImpl,
    });

    const result = await service.exchangeOAuthCallback(
      "https://app.freshfold.in/login/callback?code=pkce-code-123",
    );

    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "pkce-code-123",
    );
    expect(result).toEqual({ ok: true });
  });

  it("returns generic success on password reset to prevent account enumeration", async () => {
    const client = makeFakeSupabaseClient({
      resetPasswordForEmail: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "User not found" },
      }),
    });

    const service = createSupabaseAuthService({
      getClient: () => client,
    });

    const result = await service.requestPasswordReset("unknown@freshfold.in");
    expect(result).toEqual({ ok: true });
  });
});
