import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createMockApi } from "../../mocks/api";
import type { Role } from "@laundry/contracts";
import type { AppApi } from "../../api/types";
import { renderWithApi } from "../../test/render-with-api";
import { OrderDetailPage } from "./OrderDetailPage";

function renderOrder(
  orderId: string,
  options: {
    role?: Role;
    syncIssues?: boolean;
    api?: AppApi;
    online?: boolean;
  } = {},
) {
  return renderWithApi(
    <Routes>
      <Route
        path="/orders/:orderId"
        element={<OrderDetailPage online={options.online} />}
      />
    </Routes>,
    options.api ??
      createMockApi({
        latencyMs: 0,
        syncIssues: options.syncIssues ?? false,
        role: options.role ?? "manager",
      }),
    { route: `/orders/${orderId}` },
  );
}

describe("OrderDetailPage", () => {
  it("shows the customer, items, delivery, hold note and version", async () => {
    renderOrder("ORD-1045");

    expect(
      await screen.findByRole("heading", { name: "ORD-1045" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Meera Iyer")).toBeInTheDocument();
    expect(
      screen.getByText(/check a stain before washing/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Version 3")).toBeInTheDocument();
    expect(screen.getByText("6:00 – 8:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Trousers")).toBeInTheDocument();
  });

  it("lets a manager mark a confirmed order as washing", async () => {
    const user = userEvent.setup();
    renderOrder("ORD-1043");

    await user.click(
      await screen.findByRole("button", { name: "Mark washing" }),
    );

    expect(
      await screen.findByText("Order is now being washed."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Washing").length).toBeGreaterThan(0);
  });

  it("requires a comment before putting an order on hold", async () => {
    const user = userEvent.setup();
    renderOrder("ORD-1043");

    await user.click(
      await screen.findByRole("button", { name: "Put on hold" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Put order on hold" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Put order on hold" }),
    );

    expect(
      screen.getByText("Add a short reason for the hold."),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/Reason for hold/),
      "Waiting for the customer to confirm the stain.",
    );
    await user.click(
      screen.getByRole("button", { name: "Put order on hold" }),
    );

    expect(
      await screen.findByText("Order put on hold."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Waiting for the customer to confirm the stain."),
    ).toBeInTheDocument();
  });

  it("hides manager-only actions from the front desk", async () => {
    renderOrder("ORD-1043", { role: "front_desk" });

    await screen.findByRole("heading", { name: "ORD-1043" });

    expect(
      screen.queryByRole("button", { name: "Reschedule" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel order" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Reschedule and cancel are limited to managers."),
    ).toBeInTheDocument();
  });

  it("keeps an offline status change provisional", async () => {
    const user = userEvent.setup();
    renderOrder("ORD-1043", { online: false });

    await user.click(
      await screen.findByRole("button", { name: "Mark washing" }),
    );

    expect(
      await screen.findByText(
        "Saved on this device. It will send when you reconnect.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Waiting to send.")).toBeInTheDocument();
    expect(
      screen.queryByText("Order is now being washed."),
    ).not.toBeInTheDocument();
  });

  it("keeps an offline reschedule provisional", async () => {
    const user = userEvent.setup();
    renderOrder("ORD-1043", { online: false });

    await user.click(
      await screen.findByRole("button", { name: "Reschedule" }),
    );
    await user.selectOptions(
      screen.getByLabelText("New delivery time"),
      "slot-1400",
    );
    await user.click(screen.getByRole("button", { name: "Move delivery" }));

    expect(
      await screen.findByText(
        "Saved on this device. It will send when you reconnect.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Waiting to send.")).toBeInTheDocument();
  });

  it("shows a rejected mutation while keeping the order visible", async () => {
    renderOrder("ORD-1047", { syncIssues: true });

    expect(await screen.findByText("Change rejected.")).toBeInTheDocument();
    expect(
      screen.getByText(/could not accept this change/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ORD-1047" })).toBeInTheDocument();
  });

  it("surfaces a conflict so staff can review the latest details", async () => {
    renderOrder("ORD-1045", { syncIssues: true });

    expect(
      await screen.findByText("This order needs review."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/changed on another device/i),
    ).toBeInTheDocument();
  });

  it("moves a delivery and confirms the new time", async () => {
    const user = userEvent.setup();
    renderOrder("ORD-1043");

    await user.click(
      await screen.findByRole("button", { name: "Reschedule" }),
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
    expect(screen.getByText("2:00 – 4:00 PM")).toBeInTheDocument();
  });

  it("shows a conflict when the order changed before the move", async () => {
    const user = userEvent.setup();
    const api = createMockApi({
      latencyMs: 0,
      syncIssues: false,
      role: "manager",
    });
    renderOrder("ORD-1043", { api });

    await user.click(
      await screen.findByRole("button", { name: "Reschedule" }),
    );
    await api.applyOrderIntent("ORD-1043", "markProcessing", {}, 2);
    await user.selectOptions(
      screen.getByLabelText("New delivery time"),
      "slot-1400",
    );
    await user.click(screen.getByRole("button", { name: "Move delivery" }));

    expect(
      await screen.findByText(/changed on another device/i),
    ).toBeInTheDocument();
  });
});
