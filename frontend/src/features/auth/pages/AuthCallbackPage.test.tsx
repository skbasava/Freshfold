import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import type {
  AuthService,
  AuthSession,
  AuthSessionOutcome,
} from "../types/auth.types";

const MOCK_SESSION: AuthSession = {
  accessToken: "oauth-verified-jwt",
  rcVersion: "1.0.0",
  tenantEnabled: false,
  hubEnabled: false,
  user: {
    id: "user-oauth-1",
    email: "google.staff@freshfold.in",
    displayName: "Ananya Staff",
    role: "manager",
    hubId: "hub-1",
    hubName: "Main Hub",
    tenantId: "tenant-1",
  },
};

function createOAuthFlowService(options: {
  succeeds: boolean;
  error?: string;
}): AuthService {
  let current: AuthSessionOutcome = { kind: "unauthenticated" };
  const listeners = new Set<(outcome: AuthSessionOutcome) => void>();

  return {
    getSession: vi.fn(async () => current),
    refreshAccessToken: vi.fn(async () => null),
    onAuthStateChange: vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    signInWithPassword: vi.fn(async () => ({ ok: true })),
    signInWithGoogle: vi.fn(async () => ({ ok: true })),
    exchangeOAuthCallback: vi.fn(async () => {
      if (!options.succeeds) {
        return { ok: false, error: options.error ?? "OAuth failed" };
      }
      current = { kind: "authenticated", session: MOCK_SESSION };
      // Simulate Supabase firing SIGNED_IN while exchangeOAuthCallback is completing
      listeners.forEach((l) => l(current));
      return { ok: true };
    }),
    requestPasswordReset: vi.fn(async () => ({ ok: true })),
    updatePassword: vi.fn(async () => ({ ok: true })),
    signOut: vi.fn(async () => {
      current = { kind: "unauthenticated" };
      listeners.forEach((l) => l(current));
    }),
  };
}

describe("AuthCallbackPage", () => {
  it(
    "redirects to the dashboard after successful OAuth callback under StrictMode",
    async () => {
      const authService = createOAuthFlowService({ succeeds: true });
      const dashboardService = {
        fetchSnapshot: vi.fn(async () => ({ orders: [], slots: [] })),
      };

      render(
        <StrictMode>
          <MemoryRouter initialEntries={["/login/callback?code=pkce-123"]}>
            <App authService={authService} dashboardService={dashboardService} />
          </MemoryRouter>
        </StrictMode>,
      );

      expect(
        await screen.findByText("Manage Order", {}, { timeout: 10000 }),
      ).toBeInTheDocument();
    },
    15000,
  );

  it("displays an error card with a link back to /login when OAuth callback fails", async () => {
    const authService = createOAuthFlowService({
      succeeds: false,
      error: "Google sign-in was cancelled.",
    });

    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/login/callback?error=access_denied"]}>
          <App authService={authService} />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(
      await screen.findByText("Sign-in could not finish"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Google sign-in was cancelled."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/login");
  });
});
