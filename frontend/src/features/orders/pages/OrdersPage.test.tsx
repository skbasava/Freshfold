import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { OrdersPage } from "./OrdersPage";
import type { OrdersService } from "../services/orders.service";
import type { OrderListItem } from "../types/orders.types";

const MOCK_ORDERS: OrderListItem[] = [
  {
    id: 1,
    orderNumber: "ORD-20261119-ABCD1234",
    customerId: 101,
    customerName: "Kiran Verma",
    customerPhone: "+919876543210",
    primaryService: "Wash & Fold",
    status: "confirmed",
    totalAmountPaise: 35400,
    promisedDeliveryAt: "2026-11-21T10:00:00.000Z",
    specialInstructions: "Light starch",
    createdAt: "2026-11-19T08:00:00.000Z",
    updatedAt: "2026-11-19T08:00:00.000Z",
  },
  {
    id: 2,
    orderNumber: "ORD-20261119-EFGH5678",
    customerId: 102,
    customerName: "Meera Nair",
    customerPhone: "+919876543211",
    primaryService: "Dry Clean",
    status: "processing",
    totalAmountPaise: 59000,
    promisedDeliveryAt: "2026-11-22T14:00:00.000Z",
    specialInstructions: null,
    createdAt: "2026-11-19T08:30:00.000Z",
    updatedAt: "2026-11-19T08:30:00.000Z",
  },
];

function createOrdersServiceStub(items: OrderListItem[] = MOCK_ORDERS): OrdersService {
  return {
    listOrders: vi.fn(async () => ({ items, hasMore: false, nextCursor: null })),
    getOrder: vi.fn(),
    calculateQuote: vi.fn(),
    createOrder: vi.fn(),
    updateOrder: vi.fn(),
    transitionStatus: vi.fn(),
    addNote: vi.fn(),
    getCalendarEvent: vi.fn(async () => null),
    syncCalendarEvent: vi.fn(async () => ({ success: true, eventId: "test_event" })),
    getOrderBilling: vi.fn(),
    recordPayment: vi.fn(),
    processRefund: vi.fn(),
    getCustomerBilling: vi.fn(),
    sendNotification: vi.fn(),
  };
}

describe("OrdersPage Component", () => {
  it("renders live order records with customer name, order number, and INR amount", async () => {
    const ordersService = createOrdersServiceStub();

    render(
      <MemoryRouter>
        <OrdersPage ordersService={ordersService} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Kiran Verma")).toBeInTheDocument();
    expect(screen.getByText("ORD-20261119-ABCD1234")).toBeInTheDocument();
    expect(screen.getByText("Meera Nair")).toBeInTheDocument();
    expect(screen.getByText("ORD-20261119-EFGH5678")).toBeInTheDocument();
    expect(screen.getByText("₹354.00")).toBeInTheDocument();
    expect(screen.getByText("₹590.00")).toBeInTheDocument();
  });

  it("filters orders by search query", async () => {
    const user = userEvent.setup();
    const ordersService = createOrdersServiceStub();

    render(
      <MemoryRouter>
        <OrdersPage ordersService={ordersService} />
      </MemoryRouter>,
    );

    await screen.findByText("Kiran Verma");

    const searchInput = screen.getByPlaceholderText(
      "Search orders, customers, phone...",
    );
    await user.type(searchInput, "Meera");

    expect(screen.getByText("Meera Nair")).toBeInTheDocument();
    expect(screen.queryByText("Kiran Verma")).not.toBeInTheDocument();
  });

  it("displays empty state when orders list is empty", async () => {
    const ordersService = createOrdersServiceStub([]);

    render(
      <MemoryRouter>
        <OrdersPage ordersService={ordersService} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No orders found")).toBeInTheDocument();
    expect(screen.getByText("Create Order")).toBeInTheDocument();
  });

  it("renders error alert with retry button on failure", async () => {
    const user = userEvent.setup();
    const ordersService: OrdersService = {
      listOrders: vi
        .fn()
        .mockRejectedValueOnce(new Error("Network timeout"))
        .mockResolvedValueOnce({ items: MOCK_ORDERS, hasMore: false, nextCursor: null }),
      getOrder: vi.fn(),
      calculateQuote: vi.fn(),
      createOrder: vi.fn(),
      updateOrder: vi.fn(),
      transitionStatus: vi.fn(),
      addNote: vi.fn(),
      getCalendarEvent: vi.fn(async () => null),
      syncCalendarEvent: vi.fn(async () => ({ success: true, eventId: "test_event" })),
      getOrderBilling: vi.fn(),
      recordPayment: vi.fn(),
      processRefund: vi.fn(),
      getCustomerBilling: vi.fn(),
      sendNotification: vi.fn(),
    };

    render(
      <MemoryRouter>
        <OrdersPage ordersService={ordersService} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Error loading orders")).toBeInTheDocument();
    expect(screen.getByText("Network timeout")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Kiran Verma")).toBeInTheDocument();
  });

  it("supports pagination controls and displaying items count", async () => {
    // Generate 15 sample orders
    const manyOrders: OrderListItem[] = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      orderNumber: `ORD-20261119-${1000 + i}`,
      customerId: 100 + i,
      customerName: `Customer ${i + 1}`,
      customerPhone: "9876543210",
      primaryService: "Dry Clean",
      status: "confirmed",
      totalAmountPaise: 15000,
      promisedDeliveryAt: "2026-11-21T10:00:00.000Z",
      specialInstructions: null,
      createdAt: "2026-11-19T08:00:00.000Z",
      updatedAt: "2026-11-19T08:00:00.000Z",
    }));

    const ordersService = createOrdersServiceStub(manyOrders);
    render(
      <MemoryRouter>
        <OrdersPage ordersService={ordersService} />
      </MemoryRouter>,
    );

    // Default pageSize is 10, so first 10 orders shown: "Showing 1 to 10 of 15 orders"
    expect(await screen.findByText(/Showing/)).toBeInTheDocument();
    expect(screen.getAllByText("15").length).toBeGreaterThan(0);
    expect(screen.getByText("Customer 1")).toBeInTheDocument();
    expect(screen.getByText("Customer 10")).toBeInTheDocument();
    expect(screen.queryByText("Customer 11")).not.toBeInTheDocument();
  });

  it("renders safely without crashing when primaryService or customerName is null or undefined", async () => {
    const ordersWithMissingFields: OrderListItem[] = [
      {
        id: 99,
        orderNumber: "ORD-20261119-MISSING",
        customerId: 999,
        customerName: undefined as unknown as string,
        customerPhone: undefined,
        primaryService: undefined as unknown as string,
        status: "confirmed",
        totalAmountPaise: 12000,
        promisedDeliveryAt: null,
        specialInstructions: null,
        createdAt: "2026-11-19T08:00:00.000Z",
        updatedAt: "2026-11-19T08:00:00.000Z",
      },
    ];

    const ordersService = createOrdersServiceStub(ordersWithMissingFields);
    render(
      <MemoryRouter>
        <OrdersPage ordersService={ordersService} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("ORD-20261119-MISSING")).toBeInTheDocument();
    expect(screen.getByText("Walk-in Customer")).toBeInTheDocument();
    expect(screen.getByText("General Service")).toBeInTheDocument();
  });
});
