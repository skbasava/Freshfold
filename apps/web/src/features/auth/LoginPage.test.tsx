import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/context";
import type { AppApi } from "../../api/types";
import { AuthProvider, useAuth } from "../../auth/AuthContext";
import { AuthClientError } from "../../auth/supabase-auth-client";
import type { AuthClient } from "../../auth/types";
import { createMockApi } from "../../mocks/api";
import { MockApiError } from "../../mocks/errors";
import { LoginPage } from "./LoginPage";

function SessionProbe() {
  const auth = useAuth();
  return auth.state.status === "authenticated" ? (
    <p>Signed in as {auth.state.session.user.name}</p>
  ) : null;
}

function supabaseClient(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    provider: "supabase",
    getSession: vi.fn(async () => null),
    signIn: vi.fn(async () => undefined),
    signInWithGoogle: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    requestPasswordReset: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => undefined),
    refreshSession: vi.fn(async () => null),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
    ...overrides,
  };
}

function renderLogin({
  api = createMockApi({ latencyMs: 0, authRequired: true }),
  authClient,
  initialEntries = ["/login"],
}: {
  api?: AppApi;
  authClient?: AuthClient;
  initialEntries?: Array<string | { pathname: string; state?: unknown }>;
} = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ApiProvider api={api}>
        <AuthProvider authClient={authClient}>
          <LoginPage />
          <SessionProbe />
        </AuthProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  it("renders Google-only sign in without email, password, or password reset fields", async () => {
    renderLogin();

    expect(
      await screen.findByRole("heading", { name: "Sign in to FreshFold" }),
    ).toBeInTheDocument();
    const googleButton = screen.getByRole("button", {
      name: "Continue with Google",
    });
    expect(googleButton).toBeInTheDocument();
    expect(googleButton).toBeEnabled();
    expect(googleButton.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /forgot password/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a calm invite-only staff notice when Supabase auth is active", async () => {
    renderLogin({ authClient: supabaseClient() });

    expect(
      await screen.findByText("Restricted to approved hub staff"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Demo mode")).not.toBeInTheDocument();
  });

  it("signs in with Google demo mode", async () => {
    const user = userEvent.setup();
    renderLogin();
    await screen.findByRole("heading", { name: "Sign in to FreshFold" });

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(
      await screen.findByText("Signed in as Riya Sharma"),
    ).toBeInTheDocument();
  });

  it("starts Supabase Google OAuth when Supabase auth is active", async () => {
    const user = userEvent.setup();
    const client = supabaseClient();
    renderLogin({ authClient: client });
    await screen.findByRole("heading", { name: "Sign in to FreshFold" });

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(client.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("explains cancelled Google sign-in without leaking raw details", async () => {
    const user = userEvent.setup();
    const client = supabaseClient({
      signInWithGoogle: vi.fn(async () => {
        throw new AuthClientError("oauth_denied", "raw oauth access_denied");
      }),
    });
    renderLogin({ authClient: client });
    await screen.findByRole("heading", { name: "Sign in to FreshFold" });

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(
      await screen.findByText(
        "Google sign-in was cancelled. Try again when you are ready.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/raw oauth access_denied/i),
    ).not.toBeInTheDocument();
  });

  it("asks the user to wait after too many attempts", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0, authRequired: true });
    vi.spyOn(api, "login").mockRejectedValue(
      new MockApiError("rate limited", {
        status: 429,
        code: "RATE_LIMITED",
      }),
    );
    renderLogin({ api });
    await screen.findByRole("heading", { name: "Sign in to FreshFold" });

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(
      await screen.findByText(
        "Too many sign-in attempts. Wait a minute and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("explains when Google sign-in is returned with a callback cancellation notice", async () => {
    renderLogin({
      initialEntries: [
        { pathname: "/login", state: { oauthError: "cancelled" } },
      ],
    });

    expect(
      await screen.findByText(
        "Google sign-in was cancelled. Try again when you are ready.",
      ),
    ).toBeInTheDocument();
  });

  it("warns and disables the button in live mode when Supabase is not configured", async () => {
    const mockApi = createMockApi({ latencyMs: 0, authRequired: true });
    const liveApi: AppApi = { ...mockApi, mode: "live" };

    renderLogin({ api: liveApi });

    expect(
      await screen.findByText(
        "Google sign-in is not configured in this environment.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeDisabled();
  });

  it("explains that an expired session requires signing in again", async () => {
    const client = supabaseClient({
      getSession: vi.fn(async () => ({
        accessToken: "expired-token",
        refreshToken: "refresh-token",
        expiresAt: Math.floor(Date.now() / 1000) - 10,
        userId: "user-1",
        email: "desk@example.com",
      })),
    });

    renderLogin({ authClient: client });

    expect(
      await screen.findByText("Your session ended. Please sign in again."),
    ).toBeInTheDocument();
  });
});
