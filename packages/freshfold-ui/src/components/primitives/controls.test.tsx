import {
  Button,
  ConfirmDialog,
  DatePicker,
  Input,
  Select,
  Textarea,
} from "@freshfold/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("Button", () => {
  it("renders a safe button by default and honours variants", () => {
    render(<Button>Save order</Button>);

    const button = screen.getByRole("button", { name: "Save order" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("bg-primary");
  });

  it("blocks interaction and announces busy state while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Input", () => {
  it("connects its label, hint and error message", () => {
    render(
      <Input
        label="Customer name"
        hint="Enter the name on the receipt."
        error="Name is required."
        defaultValue=""
      />,
    );

    const input = screen.getByLabelText("Customer name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      /Enter the name on the receipt.*Name is required/,
    );
  });

  it("shows a required marker and accepts typed text", async () => {
    render(<Input label="Phone" required />);

    const input = screen.getByLabelText(/Phone/);
    await userEvent.type(input, "98765 43210");
    expect(input).toHaveValue("98765 43210");
    expect(screen.getByText("*")).toBeInTheDocument();
  });
});

describe("Select", () => {
  it("renders a labelled list and reports changes", async () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Service"
        placeholder="Choose a service"
        onChange={onChange}
        options={[
          { value: "wash", label: "Wash and fold" },
          { value: "iron", label: "Wash and iron" },
        ]}
      />,
    );

    const select = screen.getByLabelText("Service");
    expect(
      screen.getByRole("option", { name: "Choose a service" }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(select, "iron");
    expect(onChange).toHaveBeenCalled();
    expect(select).toHaveValue("iron");
  });
});

describe("Textarea", () => {
  it("connects its label and required error message", () => {
    render(
      <Textarea
        label="Reason for hold"
        hint="The customer will not see this note."
        error="Add a short reason for the hold."
        required
      />,
    );

    const textarea = screen.getByLabelText(/Reason for hold/);
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveAccessibleDescription(
      /The customer will not see this note.*Add a short reason for the hold/,
    );
  });
});

describe("DatePicker", () => {
  it("renders a labelled native date field", () => {
    render(
      <DatePicker
        label="Delivery date"
        min="2026-11-11"
        max="2026-12-31"
        defaultValue="2026-11-12"
      />,
    );

    const input = screen.getByLabelText("Delivery date");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveAttribute("min", "2026-11-11");
    expect(input).toHaveAttribute("max", "2026-12-31");
    expect(input).toHaveValue("2026-11-12");
  });
});

describe("ConfirmDialog", () => {
  it("asks for confirmation and reports the chosen action", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Cancel order?"
        description="This releases the delivery slot."
        confirmLabel="Yes, cancel"
        cancelLabel="Keep order"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(
      screen.getByRole("alertdialog", { name: "Cancel order?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This releases the delivery slot."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Keep order" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("can be dismissed with Escape", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete note?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
