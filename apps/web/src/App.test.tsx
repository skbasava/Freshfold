import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createMockApi } from "./mocks/api";

function renderApp(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App
        api={createMockApi({
          latencyMs: 0,
          syncIssues: false,
          authRequired: true,
        })}
      />
    </MemoryRouter>,
  );
}

describe("App authentication flow", () => {
  it("flushes pending mutations when the browser reconnects", async () => {
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    const getPendingCount = vi.spyOn(api, "getPendingCount");
    const flush = vi
      .spyOn(api, "syncPendingMutations")
      .mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <App api={api} />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Today at FreshFold" });
    await waitFor(() => expect(getPendingCount).toHaveBeenCalled());
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
  });

  it("sends unauthenticated users to login and returns to the intended route", async () => {
    const user = userEvent.setup();
    renderApp(["/orders"]);

    expect(
      await screen.findByRole("heading", { name: "Sign in to FreshFold" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Orders" }),
    ).toBeInTheDocument();
  });

  it("bootstraps to the login screen, signs in with Google, and signs out", async () => {
    const user = userEvent.setup();
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Sign in to FreshFold" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Today at FreshFold" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Front desk", { selector: "span" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in to FreshFold" }),
    ).toBeInTheDocument();
  });

  it("handles cancelled Google callback redirects cleanly", async () => {
    renderApp(["/login/callback?error=access_denied"]);

    expect(
      await screen.findByText(
        "Google sign-in was cancelled. Try again when you are ready.",
      ),
    ).toBeInTheDocument();
  });
});
