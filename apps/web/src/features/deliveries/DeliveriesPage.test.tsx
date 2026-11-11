import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createMockApi } from "../../mocks/api";
import { renderWithApi } from "../../test/render-with-api";
import { DeliveriesPage } from "./DeliveriesPage";

function renderDeliveries() {
  return renderWithApi(
    <Routes>
      <Route path="/deliveries" element={<DeliveriesPage />} />
      <Route path="/orders/:orderId" element={<p>Order route</p>} />
    </Routes>,
    createMockApi({ latencyMs: 0, syncIssues: false, role: "manager" }),
    { route: "/deliveries" },
  );
}

describe("DeliveriesPage", () => {
  it("shows the schedule, capacity and full slots for today", async () => {
    renderDeliveries();

    expect(
      await screen.findByRole("heading", { name: "Deliveries" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("12:00 – 2:00 PM"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Full — no places left"),
    ).toBeInTheDocument();
    expect(screen.getByText("Anita Rao")).toBeInTheDocument();
    expect(screen.getByText("6:00 – 8:00 PM")).toBeInTheDocument();
  });

  it("shows closed and full states for another date", async () => {
    renderDeliveries();
    const date = await screen.findByLabelText("Delivery date");

    fireEvent.change(date, { target: { value: "2026-11-12" } });

    expect(
      await screen.findByText("Closed — Hub closed for maintenance"),
    ).toBeInTheDocument();
    expect(screen.getByText("Full — no places left")).toBeInTheDocument();
  });

  it("lets a manager move a scheduled order to another slot", async () => {
    const user = userEvent.setup();
    renderDeliveries();

    await user.click(
      await screen.findByRole("button", {
        name: "Move order for Anita Rao",
      }),
    );
    await user.selectOptions(
      screen.getByLabelText("New delivery time"),
      "slot-1400",
    );
    await user.click(screen.getByRole("button", { name: "Move delivery" }));

    expect(
      await screen.findByText("Delivery time updated."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Move delivery" }),
      ).not.toBeInTheDocument();
    });
  });
});
