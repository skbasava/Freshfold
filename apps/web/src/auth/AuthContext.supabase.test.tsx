import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AUTH_FAILURE_EVENT } from "../api/client";
import { ApiProvider } from "../api/context";
import { createMockApi } from "../mocks/api";
import { MockApiError } from "../mocks/errors";
import { AuthProvider, useAuth } from "./AuthContext";
import { AuthClientError } from "./supabase-auth-client";
import { createAccessTokenStore } from "./token-store";
import type {
  AuthClient,
  AuthClientSession,
  AuthStateChange,
} from "./types";

const authSession: AuthClientSession = {
  accessToken: "access-token-1",
  refreshToken: "refresh-token-1",
  expiresAt: Math.floor(Date.now() / 1000) + 3_600,
  userId: "supabase-user-1",
  email: "desk@example.com",
};

function serverSession() {
  return {
    user: {
      id: "user-1",
      email: "desk@example.com",
      displayName: "Riya Sharma",
    },
    hub: { id: "hub-1", tenantId: "tenant-1" },
    role: "front_desk" as const,
    today: 1_700_000_000_000,
  };
}

function fakeAuthClient(overrides: Partial<AuthClient> = {}): AuthClient {
  let listener: ((change: AuthStateChange) => void) | null = null;
  return {
    provider: "supabase",
    getSession: vi.fn(async () => authSession),
    signIn: vi.fn(async () => undefined),
    signInWithGoogle: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    requestPasswordReset: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => undefined),
    refreshSession: vi.fn(async () => authSession),
    onAuthStateChange: vi.fn((next) => {
      listener = next;
      return {
        unsubscribe: vi.fn(() => {
          listener = null;
        }),
      };
    }),
    ...overrides,
  };
}

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <p data-testid="status">
        {auth.state.status}
        {auth.state.status === "unauthenticated" && auth.state.reason
          ? `:${auth.state.reason}`
          : ""}
      </p>
      {auth.state.status === "authenticated" ? (
        <p>
          {auth.state.session.user.name} · {auth.state.session.user.role}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() =>
          void auth.login({
            email: "desk@example.com",
            password: "demo password",
          })
        }
      >
        Sign in
      </button>
      <button type="button" onClick={() => void auth.loginWithGoogle()}>
        Sign in with Google
      </button>
      <button type="button" onClick={() => void auth.logout()}>
        Sign out
      </button>
      <button
        type="button"
        onClick={() => void auth.requestPasswordReset("desk@example.com")}
      >
        Reset password
      </button>
      <button type="button" onClick={() => void auth.setPassword("new password")}>
        Set password
      </button>
    </div>
  );
}

function renderAuth(
  authClient: AuthClient,
  api = createMockApi({ latencyMs: 0, authRequired: true }),
  tokenStore = createAccessTokenStore(),
) {
  return render(
    <ApiProvider api={api}>
      <AuthProvider authClient={authClient} tokenStore={tokenStore}>
        <Probe />
      </AuthProvider>
    </ApiProvider>,
  );
}

describe("AuthProvider with Supabase", () => {
  it("restores a session, stores the access token and scopes local data", async () => {
    const api = createMockApi({ latencyMs: 0, authRequired: true });
    const setAccountScope = vi.fn(async () => undefined);
    api.setAccountScope = setAccountScope;
    vi.spyOn(api, "getSession").mockResolvedValue(serverSession() as never);
    const tokenStore = createAccessTokenStore();

    renderAuth(fakeAuthClient(), api, tokenStore);

    expect(await screen.findByText("Riya Sharma · front_desk")).toBeInTheDocument();
    expect(tokenStore.get()).toBe("access-token-1");
    await waitFor(() =>
      expect(setAccountScope).toHaveBeenCalledWith(
        "user-1:tenant-1:hub-1",
      ),
    );
  });

  it("signs in with email and password through the identity provider", async () => {
    const user = userEvent.setup();
    const client = fakeAuthClient({
      getSession: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(authSession),
    });
    const api = createMockApi({ latencyMs: 0, authRequired: true });
    vi.spyOn(api, "getSession").mockResolvedValue(serverSession() as never);
    const tokenStore = createAccessTokenStore();

    renderAuth(client, api, tokenStore);
    await screen.findByText("unauthenticated");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Riya Sharma · front_desk")).toBeInTheDocument();
    expect(client.signIn).toHaveBeenCalledWith("desk@example.com", "demo password");
    expect(tokenStore.get()).toBe("access-token-1");
  });

  it("initiates Google OAuth through the Supabase identity provider", async () => {
    const user = userEvent.setup();
    const client = fakeAuthClient({
      getSession: vi.fn(async () => null),
    });

    renderAuth(client);
    await screen.findByText("unauthenticated");
    await user.click(screen.getByRole("button", { name: "Sign in with Google" }));

    expect(client.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("clears the session and token when refresh fails", async () => {
    const tokenStore = createAccessTokenStore("stale-token");
    const client = fakeAuthClient({
      getSession: vi.fn(async () => ({
        ...authSession,
        expiresAt: Math.floor(Date.now() / 1000) - 10,
      })),
      refreshSession: vi.fn(async () => null),
    });

    renderAuth(client, createMockApi({ latencyMs: 0, authRequired: true }), tokenStore);

    expect(await screen.findByTestId("status")).toHaveTextContent(
      "unauthenticated:expired",
    );
    expect(tokenStore.get()).toBeNull();
    expect(client.signOut).toHaveBeenCalled();
  });

  it("clears the session when restoring it throws a refresh error", async () => {
    const tokenStore = createAccessTokenStore("stale-token");
    const client = fakeAuthClient({
      getSession: vi.fn(async () => {
        throw new AuthClientError("refresh_failed", "Refresh token revoked");
      }),
    });

    renderAuth(
      client,
      createMockApi({ latencyMs: 0, authRequired: true }),
      tokenStore,
    );

    expect(await screen.findByTestId("status")).toHaveTextContent(
      "unauthenticated:expired",
    );
    expect(tokenStore.get()).toBeNull();
  });

  it("treats a revoked membership as an access failure", async () => {
    const api = createMockApi({ latencyMs: 0, authRequired: true });
    vi.spyOn(api, "getSession").mockRejectedValue(
      new MockApiError("membership inactive", {
        status: 403,
        code: "FORBIDDEN",
      }),
    );
    const client = fakeAuthClient();
    const tokenStore = createAccessTokenStore();

    renderAuth(client, api, tokenStore);

    expect(await screen.findByTestId("status")).toHaveTextContent(
      "unauthenticated:revoked",
    );
    expect(tokenStore.get()).toBeNull();
    expect(client.signOut).toHaveBeenCalled();
  });

  it("returns to a login-required state when the Gateway reports 401", async () => {
    const tokenStore = createAccessTokenStore("stale-token");
    const api = createMockApi({ latencyMs: 0, authRequired: true });
    vi.spyOn(api, "getSession").mockResolvedValue(serverSession() as never);
    renderAuth(fakeAuthClient(), api, tokenStore);
    await screen.findByText("Riya Sharma · front_desk");

    window.dispatchEvent(
      new CustomEvent(AUTH_FAILURE_EVENT, {
        detail: { status: 401, code: "expired_session" },
      }),
    );

    expect(await screen.findByTestId("status")).toHaveTextContent(
      "unauthenticated:expired",
    );
    expect(tokenStore.get()).toBeNull();
  });

  it("requests a password reset and sets a new password after recovery", async () => {
    const user = userEvent.setup();
    const client = fakeAuthClient({
      getSession: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue(authSession),
    });
    const api = createMockApi({ latencyMs: 0, authRequired: true });
    vi.spyOn(api, "getSession").mockResolvedValue(serverSession() as never);

    renderAuth(client, api);
    await screen.findByText("unauthenticated");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(client.requestPasswordReset).toHaveBeenCalledWith("desk@example.com");

    const listener = (
      client.onAuthStateChange as unknown as {
        mock: { calls: Array<[(change: AuthStateChange) => void]> };
      }
    ).mock.calls[0]?.[0];
    listener?.({ event: "password_recovery", session: authSession });
    expect(await screen.findByTestId("status")).toHaveTextContent(
      "password_recovery",
    );

    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(client.updatePassword).toHaveBeenCalledWith("new password");
    expect(await screen.findByText("Riya Sharma · front_desk")).toBeInTheDocument();
  });

  it("clears the token and account scope on logout", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0, authRequired: true });
    const setAccountScope = vi.fn(async () => undefined);
    api.setAccountScope = setAccountScope;
    vi.spyOn(api, "getSession").mockResolvedValue(serverSession() as never);
    const client = fakeAuthClient();
    const tokenStore = createAccessTokenStore();

    renderAuth(client, api, tokenStore);
    await screen.findByText("Riya Sharma · front_desk");
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByTestId("status")).toHaveTextContent(
      "unauthenticated",
    );
    expect(client.signOut).toHaveBeenCalled();
    expect(tokenStore.get()).toBeNull();
    expect(setAccountScope).toHaveBeenLastCalledWith(null);
  });
});
