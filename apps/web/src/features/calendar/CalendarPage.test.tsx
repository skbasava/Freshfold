import { fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { MockOrderSummary } from "../../mocks/types";
import { createMockApi } from "../../mocks/api";
import { renderWithApi } from "../../test/render-with-api";
import { CalendarPage } from "./CalendarPage";

function at(dayKey: string, hour: number): number {
  return Date.parse(
    `${dayKey}T${String(hour).padStart(2, "0")}:00:00+05:30`,
  );
}

function order(
  input: Pick<
    MockOrderSummary,
    | "id"
    | "customerName"
    | "serviceType"
    | "status"
    | "deliveryAt"
  > &
    Partial<MockOrderSummary>,
): MockOrderSummary {
  return {
    customerId: `C-${input.id}`,
    customerPhone: "",
    deliverySlotId: null,
    version: 1,
    holdComment: null,
    createdAt: at("2026-11-11", 8),
    updatedAt: at("2026-11-11", 9),
    cancelledAt: null,
    totalItems: 1,
    syncState: "synced",
    lastError: null,
    ...input,
  };
}

function mixedOrders(): MockOrderSummary[] {
  return [
    order({
      id: "ORD-B",
      customerName: "Karan Shah",
      serviceType: "Dry clean",
      status: "out_for_delivery",
      deliveryAt: at("2026-11-11", 12),
    }),
    order({
      id: "ORD-C",
      customerName: "Meera Iyer",
      serviceType: "Wash and fold",
      status: "hold",
      deliveryAt: at("2026-11-11", 14),
    }),
    order({
      id: "ORD-A",
      customerName: "Anita Rao",
      serviceType: "Wash and iron",
      status: "confirmed",
      deliveryAt: at("2026-11-11", 18),
    }),
    order({
      id: "ORD-D",
      customerName: "Other Date",
      serviceType: "Ironing",
      status: "confirmed",
      deliveryAt: at("2026-11-12", 9),
    }),
  ];
}

function renderCalendar() {
  const api = createMockApi({ latencyMs: 0, syncIssues: false });
  const listOrders = vi
    .spyOn(api, "listOrders")
    .mockResolvedValue({
      items: mixedOrders(),
      total: 4,
      page: 1,
      pageSize: 50,
      pageCount: 1,
    });

  renderWithApi(
    <Routes>
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/orders/:orderId" element={<p>Order route</p>} />
    </Routes>,
    api,
    { route: "/calendar" },
  );

  return { api, listOrders };
}

describe("CalendarPage", () => {
  it("shows only the selected day's orders, sorted by delivery time, with statuses", async () => {
    renderCalendar();

    expect(
      await screen.findByRole("heading", { name: "Calendar" }),
    ).toBeInTheDocument();

    const list = await screen.findByRole("list", {
      name: /Orders on Wednesday, 11 November/,
    });
    const items = within(list).getAllByRole("listitem");

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Karan Shah");
    expect(items[0]).toHaveTextContent("12:00 pm");
    expect(items[0]).toHaveTextContent("Dry clean");
    expect(items[0]).toHaveTextContent("Out for delivery");
    expect(items[1]).toHaveTextContent("Meera Iyer");
    expect(items[1]).toHaveTextContent("On hold");
    expect(items[2]).toHaveTextContent("Anita Rao");
    expect(items[2]).toHaveTextContent("Confirmed");
    expect(screen.queryByText("Other Date")).not.toBeInTheDocument();
  });

  it("defaults to today in India time and reloads when the date changes", async () => {
    renderCalendar();

    const date = await screen.findByLabelText("Calendar date");
    expect(date).toHaveValue("2026-11-11");
    expect(await screen.findByText("Karan Shah")).toBeInTheDocument();

    fireEvent.change(date, { target: { value: "2026-11-12" } });

    expect(await screen.findByText("Other Date")).toBeInTheDocument();
    expect(screen.queryByText("Karan Shah")).not.toBeInTheDocument();
  });

  it("shows an empty state when the selected day has no orders", async () => {
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    vi.spyOn(api, "listOrders").mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      pageCount: 1,
    });

    renderWithApi(<CalendarPage />, api, { route: "/calendar" });

    expect(
      await screen.findByText("No orders on this date"),
    ).toBeInTheDocument();
  });

  it("shows a retry action when orders cannot load", async () => {
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    vi.spyOn(api, "listOrders").mockRejectedValue(
      new Error("network unavailable"),
    );

    renderWithApi(<CalendarPage />, api, { route: "/calendar" });

    expect(
      await screen.findByText("We could not load calendar orders"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
