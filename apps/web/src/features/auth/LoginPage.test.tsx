import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/context";
import { AuthProvider, useAuth } from "../../auth/AuthContext";
import { createMockApi } from "../../mocks/api";
import { MockApiError } from "../../mocks/errors";
import { LoginPage } from "./LoginPage";

function SessionProbe() {
  const auth = useAuth();
  return auth.state.status === "authenticated" ? (
    <p>Signed in as {auth.state.session.user.name}</p>
  ) : null;
}

function renderLogin(api = createMockApi({ latencyMs: 0, authRequired: true })) {
  return render(
    <ApiProvider api={api}>
      <AuthProvider>
        <LoginPage />
        <SessionProbe />
      </AuthProvider>
    </ApiProvider>,
  );
}

describe("LoginPage", () => {
  it("signs in with email and password", async () => {
    const user = userEvent.setup();
    renderLogin();
    await screen.findByRole("heading", { name: "Sign in to FreshFold" });

    await user.type(screen.getByLabelText(/^Email/), "desk@example.com");
    await user.type(screen.getByLabelText(/^Password/), "demo password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Signed in as Riya Sharma")).toBeInTheDocument();
  });

  it("explains invalid credentials without leaking details", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0, authRequired: true });
    vi.spyOn(api, "login").mockRejectedValue(
      new MockApiError("bad credentials", {
        status: 401,
        code: "UNAUTHORIZED",
      }),
    );
    renderLogin(api);
    await screen.findByRole("heading", { name: "Sign in to FreshFold" });

    await user.type(screen.getByLabelText(/^Email/), "desk@example.com");
    await user.type(screen.getByLabelText(/^Password/), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Email or password is incorrect."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bad credentials/i)).not.toBeInTheDocument();
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
    renderLogin(api);
    await screen.findByRole("heading", { name: "Sign in to FreshFold" });

    await user.type(screen.getByLabelText(/^Email/), "desk@example.com");
    await user.type(screen.getByLabelText(/^Password/), "demo password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Too many attempts. Wait a minute and try again."),
    ).toBeInTheDocument();
  });

  it("requires both fields before sending", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0, authRequired: true });
    const login = vi.spyOn(api, "login");
    renderLogin(api);
    await screen.findByRole("heading", { name: "Sign in to FreshFold" });

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });
});
