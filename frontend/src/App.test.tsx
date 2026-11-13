import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createMockApi } from "./mocks/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
      await screen.findByRole("heading", { name: "Welcome Back" }),
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
      await screen.findByRole("heading", { name: "Welcome Back" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Today at FreshFold" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Front desk", { selector: "span" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Riya Sharma/i }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", { name: "Welcome Back" }),
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

describe("Workspace navigation shell", () => {
  it("supports expandable sidebar groups, nested breadcrumbs, and desktop collapse", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(min-width: 64rem)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App api={createMockApi({ latencyMs: 0, syncIssues: false })} />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Today at FreshFold" });

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Directory")).toBeInTheDocument();

    const ordersToggle = screen.getByRole("button", { name: "Orders" });
    await user.click(ordersToggle);
    expect(ordersToggle).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("link", { name: "New order" }));
    expect(
      await screen.findByRole("heading", { name: "New order" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
  });

  it("navigates to filtered orders on global search and opens notifications and help", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App api={createMockApi({ latencyMs: 0, syncIssues: true })} />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Today at FreshFold" });

    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    await user.click(screen.getByRole("button", { name: "Help & guide" }));
    expect(
      screen.getByRole("dialog", { name: "FreshFold quick guide" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Got it" }));

    const notifyButton = await screen.findByRole("button", {
      name: /Notifications/i,
    });
    await user.click(notifyButton);
    expect(
      screen.getByRole("region", { name: "Notifications" }),
    ).toBeInTheDocument();

    const searchInput = screen.getByRole("searchbox", {
      name: "Search orders or customers",
    });
    await user.type(searchInput, "Meera{Enter}");

    expect(
      await screen.findByRole("heading", { name: "Orders" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search orders")).toHaveValue("Meera");
  });
});
