import {
  Alert,
  EmptyState,
  LoadingState,
  Modal,
  Toast,
} from "@freshfold/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("Modal", () => {
  it("renders an accessible dialog and closes on request", async () => {
    const onClose = vi.fn();
    render(
      <Modal
        open
        title="Order notes"
        description="Only staff can see these notes."
        onClose={onClose}
      >
        <p>Handle with care.</p>
      </Modal>,
    );

    expect(
      screen.getByRole("dialog", { name: "Order notes" }),
    ).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Handle with care.")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /close dialog/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape and renders nothing when closed", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open title="Hello" onClose={onClose} />,
    );

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Modal open={false} title="Hello" onClose={onClose} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Toast", () => {
  it("announces a success message and can be dismissed", async () => {
    const onDismiss = vi.fn();
    render(
      <Toast tone="success" title="Order saved" onDismiss={onDismiss}>
        We will send it to the laundry team.
      </Toast>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Order saved");
    await userEvent.click(
      screen.getByRole("button", { name: /dismiss notification/i }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("uses an alert role for errors", () => {
    render(
      <Toast tone="danger" title="Could not save">
        Try again.
      </Toast>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Could not save");
  });
});

describe("Alert", () => {
  it("renders a warning with a title and action", () => {
    render(
      <Alert
        tone="warning"
        title="Delivery is busy"
        action={<button type="button">See slots</button>}
      >
        Choose another time for this order.
      </Alert>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Delivery is busy");
    expect(
      screen.getByRole("button", { name: "See slots" }),
    ).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("explains the empty state and offers a next step", () => {
    render(
      <EmptyState
        title="No orders yet"
        description="New orders will appear here."
        action={<button type="button">Create order</button>}
      />,
    );

    expect(screen.getByText("No orders yet")).toBeInTheDocument();
    expect(screen.getByText("New orders will appear here.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create order" }),
    ).toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it("announces that content is loading", () => {
    render(<LoadingState label="Loading today's orders" rows={3} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading today's orders",
    );
    expect(screen.getAllByTestId("loading-row")).toHaveLength(3);
  });
});
