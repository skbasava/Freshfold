import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UNAUTHORIZED_EVENT } from "../api/client";
import { ApiProvider } from "../api/context";
import { createMockApi } from "../mocks/api";
import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <p>{auth.state.status}</p>
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
      <button type="button" onClick={() => void auth.logout()}>
        Sign out
      </button>
    </div>
  );
}

function renderAuth(api = createMockApi({ latencyMs: 0, authRequired: true })) {
  return render(
    <ApiProvider api={api}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </ApiProvider>,
  );
}

describe("AuthProvider", () => {
  it("bootstraps a signed-out session and signs in with the server role", async () => {
    const user = userEvent.setup();
    renderAuth();

    expect(await screen.findByText("unauthenticated")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Riya Sharma · front_desk")).toBeInTheDocument();
  });

  it("clears the session on sign out", async () => {
    const user = userEvent.setup();
    renderAuth();
    await screen.findByText("unauthenticated");

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Riya Sharma · front_desk");
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("unauthenticated")).toBeInTheDocument();
  });

  it("returns to the login screen when the server rejects the session", async () => {
    const user = userEvent.setup();
    renderAuth();
    await screen.findByText("unauthenticated");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Riya Sharma · front_desk");

    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));

    expect(await screen.findByText("unauthenticated")).toBeInTheDocument();
  });

  it("shows a retry state for non-auth bootstrap failures", async () => {
    const api = createMockApi({ latencyMs: 0, authRequired: true });
    vi.spyOn(api, "getSession").mockRejectedValue(new Error("offline"));
    renderAuth(api);

    expect(await screen.findByText("error")).toBeInTheDocument();
  });
});
