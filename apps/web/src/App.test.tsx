import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createMockApi } from "./mocks/api";

function renderApp() {
  return render(
    <MemoryRouter>
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
    const flush = vi
      .spyOn(api, "syncPendingMutations")
      .mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <App api={api} />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Today at FreshFold" });
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
  });

  it("bootstraps to the login screen, signs in and signs out", async () => {
    const user = userEvent.setup();
    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Sign in to FreshFold" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Email/), "desk@example.com");
    await user.type(screen.getByLabelText(/^Password/), "demo password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "Today at FreshFold" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Front desk", { selector: "span" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in to FreshFold" }),
    ).toBeInTheDocument();
  });
});
