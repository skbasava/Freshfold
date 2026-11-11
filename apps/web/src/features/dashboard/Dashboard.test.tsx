import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createMockApi } from "../../mocks/api";
import { Dashboard } from "./Dashboard";

function renderDashboard(element: ReactElement) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

describe("Dashboard", () => {
  it("shows a loading state while the day is loading", () => {
    renderDashboard(<Dashboard api={createMockApi({ latencyMs: 50 })} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading today's orders",
    );
  });

  it("shows today's summary, recent orders and a saved state", async () => {
    renderDashboard(
      <Dashboard api={createMockApi({ latencyMs: 0, syncIssues: false })} />,
    );

    expect(await screen.findByText("Anita Rao")).toBeInTheDocument();
    expect(screen.getByText("Orders today")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getAllByText("Washing").length).toBeGreaterThan(0);
    expect(screen.getByText("Everything is saved.")).toBeInTheDocument();
  });

  it("shows friendly empty states when there is no work", async () => {
    renderDashboard(
      <Dashboard api={createMockApi({ latencyMs: 0, empty: true })} />,
    );

    expect(await screen.findByText("No recent orders")).toBeInTheDocument();
    expect(screen.getByText("No orders need attention")).toBeInTheDocument();
  });

  it("shows an error with a retry action", async () => {
    renderDashboard(<Dashboard api={createMockApi({ latencyMs: 0, fail: true })} />);

    expect(
      await screen.findByText("We could not load the dashboard"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("explains that offline work is kept on this device", async () => {
    renderDashboard(
      <Dashboard
        api={createMockApi({ latencyMs: 0, syncIssues: false })}
        online={false}
      />,
    );

    expect(await screen.findByText("You are offline.")).toBeInTheDocument();
  });

  it("surfaces pending and conflicting changes", async () => {
    renderDashboard(
      <Dashboard api={createMockApi({ latencyMs: 0, syncIssues: true })} />,
    );

    expect(
      await screen.findByText("Some changes need your review."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 change is waiting to send."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Needs review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending sync").length).toBeGreaterThan(0);
  });
});
