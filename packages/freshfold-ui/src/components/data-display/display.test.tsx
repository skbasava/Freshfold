import {
  Badge,
  Card,
  DataTable,
  StatusBadge,
  Tabs,
} from "@freshfold/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

describe("Card", () => {
  it("renders a titled surface with actions and footer", () => {
    render(
      <Card
        title="Today"
        description="Orders created today"
        actions={<button type="button">View all</button>}
        footer={<span>Updated a moment ago</span>}
      >
        <p>12 orders</p>
      </Card>,
    );

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Orders created today")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all" })).toBeInTheDocument();
    expect(screen.getByText("12 orders")).toBeInTheDocument();
    expect(screen.getByText("Updated a moment ago")).toBeInTheDocument();
  });
});

describe("Badge and StatusBadge", () => {
  it("renders a toned badge with an optional dot", () => {
    render(
      <Badge tone="success" dot>
        Ready
      </Badge>,
    );

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toHaveClass("border-success/30");
  });

  it("translates order states into plain language", () => {
    const { rerender } = render(<StatusBadge status="out_for_delivery" />);
    expect(screen.getByText("Out for delivery")).toBeInTheDocument();

    rerender(<StatusBadge status="conflict" />);
    expect(screen.getByText("Needs review")).toBeInTheDocument();

    rerender(<StatusBadge status="processing" label="In the wash" />);
    expect(screen.getByText("In the wash")).toBeInTheDocument();
  });
});

interface Row {
  id: string;
  name: string;
  count: number;
}

const columns = [
  { key: "name", header: "Customer", render: (row: Row) => row.name },
  { key: "count", header: "Orders", render: (row: Row) => row.count, align: "right" as const },
];

const rows: Row[] = [
  { id: "1", name: "Rahul Mehta", count: 3 },
  { id: "2", name: "Anita Rao", count: 1 },
];

describe("DataTable", () => {
  it("renders accessible columns and rows", () => {
    render(
      <DataTable
        caption="Recent orders"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
      />,
    );

    expect(screen.getByRole("table", { name: "Recent orders" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Customer" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Rahul Mehta" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
  });

  it("shows an empty state when there are no rows", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        emptyState={<p>No recent orders</p>}
      />,
    );

    expect(screen.getByText("No recent orders")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("announces loading without rendering an empty table", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        loading
        loadingLabel="Loading recent orders"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading recent orders",
    );
  });
});

describe("Tabs", () => {
  it("switches panels and supports arrow-key navigation", async () => {
    render(
      <Tabs
        label="Order views"
        defaultValue="today"
        items={[
          {
            value: "today",
            label: "Today",
            content: <p>Today's orders</p>,
          },
          {
            value: "attention",
            label: "Needs attention",
            content: <p>Orders needing a check</p>,
          },
        ]}
      />,
    );

    const today = screen.getByRole("tab", { name: "Today" });
    expect(today).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Today's orders")).toBeInTheDocument();

    today.focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(
      screen.getByRole("tab", { name: "Needs attention" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Orders needing a check")).toBeInTheDocument();
    expect(screen.queryByText("Today's orders")).not.toBeInTheDocument();
  });
});
