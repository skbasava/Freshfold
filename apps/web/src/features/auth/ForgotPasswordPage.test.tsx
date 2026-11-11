import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/context";
import { AuthProvider } from "../../auth/AuthContext";
import type { AuthClient } from "../../auth/types";
import { createMockApi } from "../../mocks/api";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

function authClient(): AuthClient {
  return {
    provider: "supabase",
    getSession: vi.fn(async () => null),
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    requestPasswordReset: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => undefined),
    refreshSession: vi.fn(async () => null),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
  };
}

function renderPage(client = authClient()) {
  return render(
    <MemoryRouter initialEntries={["/forgot-password"]}>
      <ApiProvider api={createMockApi({ latencyMs: 0, authRequired: true })}>
        <AuthProvider authClient={client}>
          <ForgotPasswordPage />
        </AuthProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
}

describe("ForgotPasswordPage", () => {
  it("requests a reset link and confirms without revealing account existence", async () => {
    const user = userEvent.setup();
    const client = authClient();
    renderPage(client);
    await user.type(
      screen.getByLabelText(/^Email/),
      "desk@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText(
        "If that email belongs to a staff account, a reset link is on its way.",
      ),
    ).toBeInTheDocument();
    expect(client.requestPasswordReset).toHaveBeenCalledWith("desk@example.com");
  });

  it("requires an email address", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(screen.getByText("Enter your email.")).toBeInTheDocument();
  });

  it("shows provider errors without leaking details", async () => {
    const user = userEvent.setup();
    const client = authClient();
    vi.mocked(client.requestPasswordReset).mockRejectedValue(
      new Error("raw provider failure"),
    );
    renderPage(client);
    await user.type(screen.getByLabelText(/^Email/), "desk@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText(
        "We could not send the reset link. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/raw provider failure/i)).not.toBeInTheDocument();
  });
});
