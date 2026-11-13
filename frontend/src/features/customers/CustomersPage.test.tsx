import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createMockApi } from "../../mocks/api";
import { renderWithApi } from "../../test/render-with-api";
import { CustomerDetailPage } from "./CustomerDetailPage";
import { CustomersPage } from "./CustomersPage";

function renderCustomers() {
  return renderWithApi(
    <Routes>
      <Route path="/customers" element={<CustomersPage />} />
      <Route path="/customers/:customerId" element={<p>Customer route</p>} />
    </Routes>,
    createMockApi({ latencyMs: 0, syncIssues: false }),
    { route: "/customers" },
  );
}

function renderCustomerDetail(customerId: string) {
  return renderWithApi(
    <Routes>
      <Route
        path="/customers/:customerId"
        element={<CustomerDetailPage />}
      />
    </Routes>,
    createMockApi({ latencyMs: 0, syncIssues: false }),
    { route: `/customers/${customerId}` },
  );
}

describe("CustomersPage", () => {
  it("lists customers without exposing phone numbers", async () => {
    renderCustomers();

    expect(await screen.findByText("Rahul Mehta")).toBeInTheDocument();
    expect(screen.queryByText("00000 00001")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Rahul Mehta" }),
    ).toHaveAttribute("href", "/customers/C-238");
  });

  it("searches the customer directory", async () => {
    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText("Rahul Mehta");

    await user.type(screen.getByLabelText("Search customers"), "meera");

    expect(await screen.findByText("Meera Iyer")).toBeInTheDocument();
    expect(screen.queryByText("Rahul Mehta")).not.toBeInTheDocument();
  });

  it("shows an empty state when no customer matches", async () => {
    const user = userEvent.setup();
    renderCustomers();
    await screen.findByText("Rahul Mehta");

    await user.type(screen.getByLabelText("Search customers"), "zzzzz");

    expect(
      await screen.findByText("No customers found"),
    ).toBeInTheDocument();
  });
});

describe("CustomerDetailPage", () => {
  it("shows contact details, notes and order history", async () => {
    renderCustomerDetail("C-238");

    expect(
      await screen.findByRole("heading", { name: "Rahul Mehta" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Contact number")).toBeInTheDocument();
    expect(screen.getByText("••••• 0001")).toBeInTheDocument();
    expect(
      screen.getByText("Prefers an evening delivery."),
    ).toBeInTheDocument();
    expect(screen.getByText("ORD-1042")).toBeInTheDocument();
  });

  it("reveals the phone number only when staff ask", async () => {
    const user = userEvent.setup();
    renderCustomerDetail("C-238");

    await screen.findByRole("heading", { name: "Rahul Mehta" });
    await user.click(
      screen.getByRole("button", { name: "Show phone number" }),
    );

    expect(screen.getByText("00000 00001")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide phone number" }),
    ).toBeInTheDocument();
  });
});
