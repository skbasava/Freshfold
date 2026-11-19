import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import type {
  AuthService,
  AuthSession,
  AuthSessionOutcome,
} from "@/features/auth";
import type { DashboardService, DashboardSnapshot } from "../types/dashboard.types";

const MOCK_SESSION: AuthSession = {
  accessToken: "test-access-token",
  rcVersion: "1.0.0",
  tenantEnabled: false,
  hubEnabled: false,
  user: {
    id: "user-1",
    email: "priya.manager@freshfold.in",
    displayName: "Priya Manager",
    role: "manager",
    hubId: "hub-1",
    hubName: "Main Hub",
    tenantId: "tenant-1",
  },
};

const SAMPLE_LIVE_SNAPSHOT: DashboardSnapshot = {
  orders: [
    {
      id: "ord-201",
      crnId: "crn:1:0:201",
      customerName: "Kiran Verma",
      serviceType: "Wash & Fold",
      status: "confirmed",
      deliverySlotId: "slot-2026-11-18-1400",
      deliverySlotLabel: "14:00 – 16:00",
      holdComment: null,
    },
    {
      id: "ord-202",
      crnId: "crn:1:0:202",
      customerName: "Meera Nair",
      serviceType: "Dry Clean",
      status: "processing",
      deliverySlotId: "slot-2026-11-18-1600",
      deliverySlotLabel: "16:00 – 18:00",
      holdComment: null,
    },
    {
      id: "ord-203",
      crnId: "crn:1:0:203",
      customerName: "Rohan Desai",
      serviceType: "Wash & Iron",
      status: "hold",
      deliverySlotId: "slot-2026-11-18-1800",
      deliverySlotLabel: "18:00 – 20:00",
      holdComment: "Confirm stain removal",
    },
  ],
  slots: [
    { id: "slot-2026-11-18-1400", label: "14:00 – 16:00", booked: 1, capacity: 10 },
    { id: "slot-2026-11-18-1600", label: "16:00 – 18:00", booked: 1, capacity: 10 },
    { id: "slot-2026-11-18-1800", label: "18:00 – 20:00", booked: 1, capacity: 10 },
  ],
};

function createAuthService(initial: AuthSessionOutcome): AuthService {
  let current: AuthSessionOutcome = initial;
  const listeners = new Set<(next: AuthSessionOutcome) => void>();

  return {
    getSession: vi.fn(async () => current),
    refreshAccessToken: vi.fn(async () =>
      current.kind === "authenticated" ? current.session.accessToken : null,
    ),
    onAuthStateChange: vi.fn((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    signInWithPassword: vi.fn(async () => {
      current = { kind: "authenticated", session: MOCK_SESSION };
      listeners.forEach((l) => l(current));
      return { ok: true };
    }),
    signInWithGoogle: vi.fn(async () => ({ ok: true })),
    exchangeOAuthCallback: vi.fn(async () => ({ ok: true })),
    requestPasswordReset: vi.fn(async () => ({ ok: true })),
    updatePassword: vi.fn(async () => ({ ok: true })),
    signOut: vi.fn(async () => {
      current = { kind: "unauthenticated" };
      listeners.forEach((l) => l(current));
    }),
  };
}

function createDashboardServiceStub(
  snapshot: DashboardSnapshot = SAMPLE_LIVE_SNAPSHOT,
): DashboardService {
  return {
    fetchSnapshot: vi.fn(async () => snapshot),
  };
}

describe("Protected Routes & Inset Card Dashboard Workspace", () => {
  it("redirects unauthenticated users from / to /login", async () => {
    const authService = createAuthService({ kind: "unauthenticated" });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App authService={authService} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Sign in to FreshFold"),
    ).toBeInTheDocument();
  });

  it("redirects unauthenticated users from any nested route to /login", async () => {
    const authService = createAuthService({ kind: "unauthenticated" });

    render(
      <MemoryRouter initialEntries={["/orders"]}>
        <App authService={authService} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Sign in to FreshFold"),
    ).toBeInTheDocument();
  });

  it("fails closed when server returns membership_missing (403)", async () => {
    const authService = createAuthService({
      kind: "denied",
      code: "membership_missing",
      message: "No FreshFold staff role assigned.",
      email: "newstaff@freshfold.in",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App authService={authService} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Staff access not assigned"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No FreshFold staff role assigned."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Manage Order")).not.toBeInTheDocument();
  });

  it("redirects PASSWORD_RECOVERY sessions to /reset-password", async () => {
    const authService = createAuthService({ kind: "password_recovery" });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App authService={authService} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Set a new password"),
    ).toBeInTheDocument();
  });

  it("redirects authenticated users away from /login to the dashboard", async () => {
    const authService = createAuthService({
      kind: "authenticated",
      session: MOCK_SESSION,
    });
    const dashboardService = createDashboardServiceStub();

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App authService={authService} dashboardService={dashboardService} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Manage Order"),
    ).toBeInTheDocument();
  });

  it("renders inset card theme with KPI cards, delivery slots, and live order table", async () => {
    const authService = createAuthService({
      kind: "authenticated",
      session: MOCK_SESSION,
    });
    const dashboardService = createDashboardServiceStub();

    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App authService={authService} dashboardService={dashboardService} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Kiran Verma")).toBeInTheDocument();
    expect(screen.getByText("Meera Nair")).toBeInTheDocument();
    expect(screen.getByText("Rohan Desai")).toBeInTheDocument();

    // Inset card layout active
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    expect(sidebar).toHaveAttribute("data-variant", "inset");

    // Top navbar + dashboard greeting header + blocks
    expect(
      screen.getByRole("button", { name: "Toggle sidebar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Good (Morning|Afternoon|Evening), Priya Manager/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Active Orders")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Manage Order")).toBeInTheDocument();
  });

  it("shows a clean empty state with no dummy data when live API returns empty lists", async () => {
    const authService = createAuthService({
      kind: "authenticated",
      session: MOCK_SESSION,
    });
    const dashboardService = createDashboardServiceStub({
      orders: [],
      slots: [],
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App authService={authService} dashboardService={dashboardService} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("No orders in this view"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Rajesh Kumar")).not.toBeInTheDocument();
  });

  it("shows a destructive error banner and retries live fetch on click", async () => {
    const user = userEvent.setup();
    const authService = createAuthService({
      kind: "authenticated",
      session: MOCK_SESSION,
    });
    const dashboardService: DashboardService = {
      fetchSnapshot: vi
        .fn()
        .mockRejectedValueOnce(new Error("Gateway temporarily unreachable"))
        .mockResolvedValueOnce(SAMPLE_LIVE_SNAPSHOT),
    };

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App authService={authService} dashboardService={dashboardService} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Could not load realtime hub data"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Gateway temporarily unreachable"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Kiran Verma")).toBeInTheDocument();
  });

  it("collapses the sidebar to icon mode when clicking the sidebar toggle", async () => {
    const user = userEvent.setup();
    const authService = createAuthService({
      kind: "authenticated",
      session: MOCK_SESSION,
    });
    const dashboardService = createDashboardServiceStub();

    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App authService={authService} dashboardService={dashboardService} />
      </MemoryRouter>,
    );

    await screen.findByText("Kiran Verma");

    const sidebar = container.querySelector('[data-slot="sidebar"]');
    expect(sidebar).toHaveAttribute("data-state", "expanded");

    await user.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-collapsible", "icon");

    const sidebarQueries = within(sidebar as HTMLElement);
    const dashboardLink = sidebarQueries.getByRole("link", {
      name: "Dashboard",
    });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink.querySelector("svg")).not.toBeNull();
    expect(
      sidebarQueries.getByRole("link", { name: "Orders" }),
    ).toBeInTheDocument();
  });

  it("filters live orders via status tabs and top navbar search", async () => {
    const user = userEvent.setup();
    const authService = createAuthService({
      kind: "authenticated",
      session: MOCK_SESSION,
    });
    const dashboardService = createDashboardServiceStub();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App authService={authService} dashboardService={dashboardService} />
      </MemoryRouter>,
    );

    await screen.findByText("Kiran Verma");

    await user.click(screen.getByRole("tab", { name: /On Hold/i }));
    expect(screen.getByText("Rohan Desai")).toBeInTheDocument();
    expect(screen.queryByText("Kiran Verma")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /All Orders/i }));
    const searchInput = screen.getByRole("searchbox", {
      name: "Search orders or customers",
    });
    await user.type(searchInput, "Meera");

    expect(screen.getByText("Meera Nair")).toBeInTheDocument();
    expect(screen.queryByText("Kiran Verma")).not.toBeInTheDocument();
  });

  it("signs out from the top navbar account menu and returns to /login", async () => {
    const user = userEvent.setup();
    const authService = createAuthService({
      kind: "authenticated",
      session: MOCK_SESSION,
    });
    const dashboardService = createDashboardServiceStub();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App authService={authService} dashboardService={dashboardService} />
      </MemoryRouter>,
    );

    await screen.findByText("Kiran Verma");

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByText("Sign out"));

    expect(authService.signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByText("Sign in to FreshFold")).toBeInTheDocument();
    });
  });

  it("renders touch-native mobile order cards and inline search on iPhone viewports", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 390,
    });

    try {
      const user = userEvent.setup();
      const authService = createAuthService({
        kind: "authenticated",
        session: MOCK_SESSION,
      });
      const dashboardService = createDashboardServiceStub();

      render(
        <MemoryRouter initialEntries={["/"]}>
          <App authService={authService} dashboardService={dashboardService} />
        </MemoryRouter>,
      );

      expect(
        await screen.findByTestId("mobile-orders-list"),
      ).toBeInTheDocument();
      expect(screen.getByText("Kiran Verma")).toBeInTheDocument();

      const mobileSearch = screen.getByRole("searchbox", {
        name: "Search hub orders",
      });
      await user.type(mobileSearch, "Rohan");

      expect(screen.getByText("Rohan Desai")).toBeInTheDocument();
      expect(screen.queryByText("Kiran Verma")).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: originalWidth,
      });
    }
  });

  it("supports interactive column sorting and pagination in the order data table", async () => {
    const user = userEvent.setup();
    const authService = createAuthService({
      kind: "authenticated",
      session: MOCK_SESSION,
    });

    const twelveOrders = Array.from({ length: 12 }, (_, idx) => ({
      id: `ord-${300 + idx}`,
      crnId: `crn:1:0:${300 + idx}`,
      customerName:
        idx === 0
          ? "Zara Patel"
          : idx === 1
            ? "Aarav Sharma"
            : `Customer ${String(idx + 1).padStart(2, "0")}`,
      serviceType: idx % 2 === 0 ? "Wash & Fold" : "Dry Clean",
      status: (idx === 0 ? "hold" : "confirmed") as "hold" | "confirmed",
      deliverySlotId: "slot-2026-11-18-1400",
      deliverySlotLabel: "14:00 – 16:00",
      holdComment: idx === 0 ? "Check collar stain" : null,
    }));

    const dashboardService = createDashboardServiceStub({
      orders: twelveOrders,
      slots: SAMPLE_LIVE_SNAPSHOT.slots,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App authService={authService} dashboardService={dashboardService} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Zara Patel")).toBeInTheDocument();

    // Pagination defaults to 10 rows per page (Page 1 of 2)
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Customer 12")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Customer 12")).toBeInTheDocument();

    // Sort by Customer ascending resets to Page 1 and puts Aarav Sharma first
    await user.click(screen.getByRole("button", { name: "Customer" }));
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    const firstRow = container.querySelector("tbody tr");
    expect(firstRow?.textContent).toContain("Aarav Sharma");
  });
});
