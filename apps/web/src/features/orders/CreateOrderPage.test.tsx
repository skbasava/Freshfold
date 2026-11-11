import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useParams } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createMockApi } from "../../mocks/api";
import { renderWithApi } from "../../test/render-with-api";
import { CreateOrderPage } from "./CreateOrderPage";
import { OrderDetailPage } from "./OrderDetailPage";

function OrderDetailStub() {
  const { orderId } = useParams();
  return <p>Order details for {orderId}</p>;
}

function renderCreateOrder() {
  return renderWithApi(
    <Routes>
      <Route path="/orders/new" element={<CreateOrderPage />} />
      <Route path="/orders/:orderId" element={<OrderDetailStub />} />
    </Routes>,
    createMockApi({ latencyMs: 0, syncIssues: false, role: "manager" }),
    { route: "/orders/new" },
  );
}

function renderCreateOrderWithDetail() {
  return renderWithApi(
    <Routes>
      <Route path="/orders/new" element={<CreateOrderPage />} />
      <Route path="/orders/:orderId" element={<OrderDetailPage />} />
    </Routes>,
    createMockApi({ latencyMs: 0, syncIssues: false, role: "manager" }),
    { route: "/orders/new" },
  );
}

function renderOfflineCreateOrder() {
  return renderWithApi(
    <Routes>
      <Route
        path="/orders/new"
        element={<CreateOrderPage online={false} />}
      />
      <Route
        path="/orders/:orderId"
        element={<OrderDetailPage online={false} />}
      />
    </Routes>,
    createMockApi({ latencyMs: 0, syncIssues: false, role: "manager" }),
    { route: "/orders/new" },
  );
}

describe("CreateOrderPage", () => {
  it("explains what is missing when the form is empty", async () => {
    const user = userEvent.setup();
    renderCreateOrder();

    await user.click(
      await screen.findByRole("button", { name: "Create order" }),
    );

    expect(screen.getByText("Enter the customer's name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid phone number.")).toBeInTheDocument();
    expect(screen.getByText("Choose a service.")).toBeInTheDocument();
    expect(screen.getByText("Choose a delivery time.")).toBeInTheDocument();
    expect(screen.getByText("Add at least one item.")).toBeInTheDocument();
  });

  it("creates an order and opens its detail page", async () => {
    const user = userEvent.setup();
    renderCreateOrder();

    await screen.findByRole("heading", { name: "New order" });
    await user.type(
      await screen.findByLabelText(/^Customer name/),
      "Rahul Mehta",
    );
    await user.type(screen.getByLabelText(/^Phone number/), "0000000001");
    await user.selectOptions(
      screen.getByLabelText(/^Service/),
      "Wash and fold",
    );
    await user.selectOptions(
      screen.getByLabelText(/^Delivery time/),
      "slot-1400",
    );
    await user.type(
      screen.getByLabelText("Item 1 description"),
      "Shirt",
    );

    await user.click(screen.getByRole("button", { name: "Create order" }));

    expect(
      await screen.findByText("Order details for ORD-1048"),
    ).toBeInTheDocument();
  });

  it("creates an offline order and clearly marks it as waiting to send", async () => {
    const user = userEvent.setup();
    renderOfflineCreateOrder();

    await screen.findByRole("heading", { name: "New order" });
    await user.type(
      await screen.findByLabelText(/^Customer name/),
      "Rahul Mehta",
    );
    await user.type(screen.getByLabelText(/^Phone number/), "0000000001");
    await user.selectOptions(
      screen.getByLabelText(/^Service/),
      "Wash and fold",
    );
    await user.selectOptions(
      screen.getByLabelText(/^Delivery time/),
      "slot-1400",
    );
    await user.type(
      screen.getByLabelText("Item 1 description"),
      "Shirt",
    );
    await user.click(screen.getByRole("button", { name: "Create order" }));

    expect(
      await screen.findByRole("heading", { name: "ORD-1048" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Waiting to send.")).toBeInTheDocument();
    expect(
      screen.getByText("Saved on this device. Waiting for the server to confirm."),
    ).toBeInTheDocument();
  });

  it("explains when a new customer was added for the phone number", async () => {
    const user = userEvent.setup();
    renderCreateOrderWithDetail();

    await screen.findByRole("heading", { name: "New order" });
    await user.type(
      await screen.findByLabelText(/^Customer name/),
      "Asha Verma",
    );
    await user.type(screen.getByLabelText(/^Phone number/), "9876543210");
    await user.selectOptions(
      screen.getByLabelText(/^Service/),
      "Wash and fold",
    );
    await user.selectOptions(
      screen.getByLabelText(/^Delivery time/),
      "slot-1400",
    );
    await user.type(
      screen.getByLabelText("Item 1 description"),
      "Shirt",
    );

    await user.click(screen.getByRole("button", { name: "Create order" }));

    expect(
      await screen.findByText(
        "No customer found for this phone. Added Asha Verma to the customer list.",
      ),
    ).toBeInTheDocument();
  });

  it("does not show the new-customer notice when an existing customer is reused", async () => {
    const user = userEvent.setup();
    renderCreateOrderWithDetail();

    await screen.findByRole("heading", { name: "New order" });
    await user.type(
      await screen.findByLabelText(/^Customer name/),
      "Rahul Mehta",
    );
    await user.type(screen.getByLabelText(/^Phone number/), "0000000001");
    await user.selectOptions(
      screen.getByLabelText(/^Service/),
      "Wash and fold",
    );
    await user.selectOptions(
      screen.getByLabelText(/^Delivery time/),
      "slot-1400",
    );
    await user.type(
      screen.getByLabelText("Item 1 description"),
      "Shirt",
    );

    await user.click(screen.getByRole("button", { name: "Create order" }));

    expect(
      await screen.findByRole("heading", { name: "ORD-1048" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No customer found for this phone/),
    ).not.toBeInTheDocument();
  });

  it("shows full and closed delivery times as unavailable", async () => {
    renderCreateOrder();

    const full = await screen.findByRole("option", {
      name: /12:00 – 2:00 PM \(Full\)/,
    });
    expect(full).toBeDisabled();
    expect(
      screen.getByRole("option", {
        name: /6:00 – 8:00 PM \(Closed\)/,
      }),
    ).toBeDisabled();
  });
});
