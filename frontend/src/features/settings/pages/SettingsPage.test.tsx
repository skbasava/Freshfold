import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage Component", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders the Indian GST configuration card and displays 18% GST by default", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/health/database")) {
        return new Response(
          JSON.stringify({ status: "ok", foreignKeysEnabled: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/settings/gst")) {
        return new Response(
          JSON.stringify({ data: { enabled: true } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Settings & Hub Master")).toBeInTheDocument();
    expect(screen.getByText("Indian GST & Tax Collection Master")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("GST Active (18% Tax Rate)")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Indian Small Laundry Business Exemption Policy/i),
    ).toBeInTheDocument();
    expect(screen.getByText("SAC 999712")).toBeInTheDocument();
    expect(screen.getByText("SAC 999711")).toBeInTheDocument();
  });

  it("toggles GST off to enable 0% tax exemption for small laundry business", async () => {
    let currentEnabled = true;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.includes("/health/database")) {
        return new Response(
          JSON.stringify({ status: "ok", foreignKeysEnabled: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/settings/gst")) {
        if (init?.method === "PATCH") {
          const body = JSON.parse(init.body as string) as { enabled: boolean };
          currentEnabled = body.enabled;
          return new Response(
            JSON.stringify({ data: { enabled: currentEnabled } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ data: { enabled: currentEnabled } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    // Initial state: GST Enabled
    await waitFor(() => {
      expect(screen.getByText("GST Active (18% Tax Rate)")).toBeInTheDocument();
    });

    const toggleSwitch = screen.getByRole("switch");
    expect(toggleSwitch).toHaveAttribute("aria-checked", "true");

    // Click toggle to disable GST (exempt small business)
    await user.click(toggleSwitch);

    await waitFor(() => {
      expect(
        screen.getByText("Tax Exempt (0% GST - Small Business)"),
      ).toBeInTheDocument();
      expect(toggleSwitch).toHaveAttribute("aria-checked", "false");
    });

    // Check SAC cards reflect 0% (Tax Exempt)
    expect(screen.getAllByText("0% (Tax Exempt)").length).toBeGreaterThanOrEqual(2);
  });
});
