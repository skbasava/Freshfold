import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/context";
import { AuthProvider } from "../../auth/AuthContext";
import type { AuthClient, AuthClientSession } from "../../auth/types";
import { createMockApi } from "../../mocks/api";
import { ResetPasswordPage } from "./ResetPasswordPage";

const authSession: AuthClientSession = {
  accessToken: "recovery-token",
  refreshToken: "refresh-token",
  expiresAt: Math.floor(Date.now() / 1000) + 3_600,
  userId: "user-1",
  email: "desk@example.com",
};

function authClient(): AuthClient {
  return {
    provider: "supabase",
    getSession: vi.fn(async () => authSession),
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    requestPasswordReset: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => undefined),
    refreshSession: vi.fn(async () => authSession),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
  };
}

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

function renderPage(client = authClient()) {
  const api = createMockApi({ latencyMs: 0, authRequired: true });
  vi.spyOn(api, "getSession").mockResolvedValue(serverSession() as never);
  return render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <ApiProvider api={api}>
        <AuthProvider authClient={client}>
          <ResetPasswordPage />
        </AuthProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("ResetPasswordPage", () => {
  it("sets a password for an invited employee after the recovery link", async () => {
    window.history.replaceState({}, "", "/reset-password#type=invite");
    const user = userEvent.setup();
    const client = authClient();
    renderPage(client);

    expect(
      await screen.findByRole("heading", { name: "Set your password" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^New password/), "strong password");
    await user.type(screen.getByLabelText(/^Confirm password/), "strong password");
    await user.click(screen.getByRole("button", { name: "Save password" }));

    expect(
      await screen.findByText("Your password is set."),
    ).toBeInTheDocument();
    expect(client.updatePassword).toHaveBeenCalledWith("strong password");
  });

  it("rejects mismatched passwords", async () => {
    window.history.replaceState({}, "", "/reset-password#type=recovery");
    const user = userEvent.setup();
    const client = authClient();
    renderPage(client);
    await screen.findByRole("heading", { name: "Set your password" });

    await user.type(screen.getByLabelText(/^New password/), "strong password");
    await user.type(screen.getByLabelText(/^Confirm password/), "different");
    await user.click(screen.getByRole("button", { name: "Save password" }));

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(client.updatePassword).not.toHaveBeenCalled();
  });

  it("explains an invalid or expired reset link", async () => {
    const client = authClient();
    vi.mocked(client.getSession).mockResolvedValue(null);
    renderPage(client);

    expect(
      await screen.findByText(/link is not valid or has expired/i),
    ).toBeInTheDocument();
  });
});
