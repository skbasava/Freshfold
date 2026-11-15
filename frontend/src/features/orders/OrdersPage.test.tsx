import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createMockApi } from "../../test/mocks/api";
import { renderWithApi } from "../../test/render-with-api";
import { OrdersPage } from "./OrdersPage";

function renderOrders(
  api = createMockApi({ latencyMs: 0, syncIssues: false }),
) {
  return renderWithApi(
    <Routes>
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/new" element={<p>New order route</p>} />
      <Route path="/orders/:orderId" element={<p>Order route</p>} />
    </Routes>,
    api,
    { route: "/orders" },
  );
}

describe("OrdersPage", () => {
  it("lists orders and shows the page window", async () => {
    renderOrders();

    expect(await screen.findByText("ORD-1047")).toBeInTheDocument();
    expect(screen.getByText("Vikram Singh")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("searches by customer name", async () => {
    const user = userEvent.setup();
    renderOrders();
    await screen.findByText("ORD-1047");

    await user.type(screen.getByLabelText("Search orders"), "meera");

    expect(await screen.findByText("ORD-1045")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("ORD-1047")).not.toBeInTheDocument();
    });
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    renderOrders();
    await screen.findByText("ORD-1047");

    await user.selectOptions(screen.getByLabelText("Status"), "hold");

    expect(await screen.findByText("ORD-1045")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("ORD-1043")).not.toBeInTheDocument();
    });
  });

  it("moves to the next page", async () => {
    const user = userEvent.setup();
    renderOrders();
    await screen.findByText("ORD-1047");

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(await screen.findByText("ORD-1046")).toBeInTheDocument();
  });

  it("shows an empty state for a search with no matches", async () => {
    const user = userEvent.setup();
    renderOrders();
    await screen.findByText("ORD-1047");

    await user.type(screen.getByLabelText("Search orders"), "nobody here");

    expect(
      await screen.findByText("No orders found"),
    ).toBeInTheDocument();
  });

  it("shows an onboarding empty state when no orders exist yet", async () => {
    renderOrders(
      createMockApi({ latencyMs: 0, empty: true }),
    );

    expect(
      await screen.findByText("No orders yet"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "New order" }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("shows pending, conflict and rejected sync states", async () => {
    renderOrders(
      createMockApi({ latencyMs: 0, syncIssues: true }),
    );

    expect(
      await screen.findByText("Some orders need your attention."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Pending sync").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Needs review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rejected").length).toBeGreaterThan(0);
  });

  it("opens quick preview panel with order details and CRN", async () => {
    const user = userEvent.setup();
    renderOrders();
    await screen.findByText("ORD-1047");

    const quickPreviewButtons = screen.getAllByTitle("Quick preview");
    expect(quickPreviewButtons.length).toBeGreaterThan(0);
    await user.click(quickPreviewButtons[0]);

    expect(await screen.findByRole("heading", { name: "Order ORD-1047" })).toBeInTheDocument();
    expect(screen.getByText("State Model Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("Order Operations")).toBeInTheDocument();
  });

  it("advances order status directly from the table action", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0 });
    renderOrders(api);

    await screen.findByText("ORD-1047");
    // Multiple confirmed orders may be listed, click the first "Mark washing"
    const markWashingButtons = await screen.findAllByRole("button", { name: "Mark washing" });
    await user.click(markWashingButtons[0]);

    expect(await screen.findByText("Order marked as washing.")).toBeInTheDocument();
  });

  it("edits customer notes directly from the orders list", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0 });
    renderOrders(api);

    await screen.findByText("ORD-1047");
    const editButtons = screen.getAllByTitle("Edit customer note");
    await user.click(editButtons[0]);

    expect(await screen.findByRole("heading", { name: "Edit customer note" })).toBeInTheDocument();
    const textarea = screen.getByLabelText("Customer Notes");
    fireEvent.change(textarea, { target: { value: "Hand wash delicate silk" } });
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(await screen.findByText("Customer note updated for Vikram Singh.")).toBeInTheDocument();
  });

  it("cancels an order with confirmation dialog and releases delivery capacity", async () => {
    const user = userEvent.setup();
    const api = createMockApi({ latencyMs: 0, role: "manager" });
    renderOrders(api);

    await screen.findByText("ORD-1047");
    const cancelButtons = screen.getAllByTitle("Cancel order");
    await user.click(cancelButtons[0]);

    expect(await screen.findByText("Cancel order ORD-1047?")).toBeInTheDocument();
    expect(
      screen.getByText(/release the delivery slot capacity atomically/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, cancel order" }));

    expect(
      await screen.findByText(/Order ORD-1047 was cancelled and delivery slot capacity released/),
    ).toBeInTheDocument();
  });

  it("filters orders using quick filter pill buttons", async () => {
    const user = userEvent.setup();
    renderOrders();

    await screen.findByText("ORD-1047");
    // Click quick filter pill "Washing" (which maps to processing)
    const washingPill = screen.getByRole("button", { name: "Washing" });
    await user.click(washingPill);

    expect(await screen.findByText("ORD-1042")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("ORD-1047")).not.toBeInTheDocument();
    });
  });
});
