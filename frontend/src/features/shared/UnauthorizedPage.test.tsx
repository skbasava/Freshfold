import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { UnauthorizedPage } from "./UnauthorizedPage";

describe("UnauthorizedPage", () => {
  it("renders 403 access denied message with role badge and resource name", () => {
    render(
      <MemoryRouter>
        <UnauthorizedPage role="front_desk" resourceName="tenants" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Access Denied" })).toBeInTheDocument();
    expect(screen.getByText("Super Admin access required")).toBeInTheDocument();
    expect(screen.getByText(/Only Super Administrators can access and manage tenants\./)).toBeInTheDocument();
    expect(screen.getByText("Front desk")).toBeInTheDocument();
  });

  it("provides navigation actions to return to dashboard and orders", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/unauthorized"]}>
        <Routes>
          <Route
            path="/unauthorized"
            element={<UnauthorizedPage role="manager" resourceName="hubs" />}
          />
          <Route path="/" element={<h1>Dashboard Page</h1>} />
          <Route path="/orders" element={<h1>Orders Page</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Only Super Administrators can access and manage hubs\./)).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to Dashboard" }));
    expect(screen.getByRole("heading", { name: "Dashboard Page" })).toBeInTheDocument();
  });
});

