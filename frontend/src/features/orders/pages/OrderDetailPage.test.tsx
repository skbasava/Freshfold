import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { OrderDetailPage } from "./OrderDetailPage";
import type { OrdersService } from "../services/orders.service";
import type { OrderDetail } from "../types/orders.types";

const MOCK_ORDER_DETAIL: OrderDetail = {
  order: {
    id: 42,
    orderNumber: "ORD-20261119-TEST42",
    customerId: 101,
    customerName: "Kiran Verma",
    customerPhone: "+919876543210",
    primaryService: "Wash & Fold",
    status: "confirmed",
    totalAmountPaise: 35400,
    promisedDeliveryAt: "2026-11-21T10:00:00.000Z",
    specialInstructions: "Handle silk shirts with extra care",
    createdAt: "2026-11-19T08:00:00.000Z",
    updatedAt: "2026-11-19T08:00:00.000Z",
    branchId: 1,
    rateCardId: 1,
    pickupAddressId: null,
    deliveryAddressId: null,
    currency: "INR",
    supplierStateCode: "KA",
    placeOfSupplyStateCode: "KA",
    taxSupplyType: "intra_state",
    subtotalPaise: 30000,
    discountPaise: 0,
    taxableAmountPaise: 30000,
    cgstPaise: 2700,
    sgstPaise: 2700,
    igstPaise: 0,
    totalTaxPaise: 5400,
    adjustmentsPaise: 0,
  },
  items: [
    {
      id: 1,
      serviceId: 1,
      itemId: 10,
      serviceNameSnapshot: "Wash & Fold",
      itemNameSnapshot: "Men's Formal Shirt",
      hsnSacCodeSnapshot: "999712",
      pricingBasis: "per_item",
      quantityPieces: 2,
      weightGrams: null,
      unitPricePaise: 15000,
      grossAmountPaise: 30000,
      discountPaise: 0,
      taxableAmountPaise: 30000,
      taxRateBps: 1800,
      cgstAmountPaise: 2700,
      sgstAmountPaise: 2700,
      igstAmountPaise: 0,
      totalTaxPaise: 5400,
      lineTotalPaise: 35400,
      notes: "Light starch on collars",
    },
  ],
  statusHistory: [
    {
      id: 1,
      fromStatus: null,
      toStatus: "confirmed",
      reason: "Order created at desk",
      changedByUserId: 1,
      createdAt: "2026-11-19T08:00:00.000Z",
    },
  ],
  notes: [
    {
      id: 1,
      note: "Customer confirmed color fastness",
      isInternal: true,
      createdByUserId: 1,
      createdAt: "2026-11-19T08:05:00.000Z",
    },
  ],
  adjustments: [],
};

function createOrdersServiceStub(data: OrderDetail = MOCK_ORDER_DETAIL): OrdersService {
  return {
    listOrders: vi.fn(),
    getOrder: vi.fn(async () => data),
    calculateQuote: vi.fn(async () => ({
      subtotalPaise: 30000,
      discountPaise: 0,
      taxableAmountPaise: 30000,
      cgstPaise: 2700,
      sgstPaise: 2700,
      igstPaise: 0,
      totalTaxPaise: 5400,
      totalAmountPaise: 35400,
      lines: [],
    })),
    createOrder: vi.fn(),
    updateOrder: vi.fn(async () => data),
    transitionStatus: vi.fn(async (_id, toStatus) => ({
      ...data.order,
      status: toStatus,
    })),
    addNote: vi.fn(async () => {}),
    getCalendarEvent: vi.fn(async () => null),
    syncCalendarEvent: vi.fn(async () => ({ success: true, eventId: "test_event" })),
    getOrderBilling: vi.fn(async (orderId) => ({
      orderId,
      orderNumber: data.order.orderNumber,
      customerId: data.order.customerId,
      totalAmountPaise: data.order.totalAmountPaise,
      capturedAmountPaise: 0,
      refundedAmountPaise: 0,
      netPaidAmountPaise: 0,
      balanceDuePaise: data.order.totalAmountPaise,
      paymentStatus: "unpaid" as const,
      payments: [],
      refunds: [],
      invoices: [],
    })),
    recordPayment: vi.fn(async (orderId, input) => ({
      payment: {
        id: 1,
        paymentNumber: "PAY-20261119-001",
        customerId: data.order.customerId,
        orderId,
        paymentMethod: input.paymentMethod,
        status: "captured" as const,
        amountPaise: input.amountPaise,
        capturedAmountPaise: input.amountPaise,
        refundedAmountPaise: 0,
        currency: "INR",
        createdAt: "2026-11-19T09:00:00.000Z",
      },
      billing: {
        orderId,
        orderNumber: data.order.orderNumber,
        customerId: data.order.customerId,
        totalAmountPaise: data.order.totalAmountPaise,
        capturedAmountPaise: input.amountPaise,
        refundedAmountPaise: 0,
        netPaidAmountPaise: input.amountPaise,
        balanceDuePaise: Math.max(0, data.order.totalAmountPaise - input.amountPaise),
        paymentStatus:
          input.amountPaise >= data.order.totalAmountPaise
            ? ("paid" as const)
            : ("partially_paid" as const),
        payments: [
          {
            id: 1,
            paymentNumber: "PAY-20261119-001",
            customerId: data.order.customerId,
            orderId,
            paymentMethod: input.paymentMethod,
            status: "captured" as const,
            amountPaise: input.amountPaise,
            capturedAmountPaise: input.amountPaise,
            refundedAmountPaise: 0,
            currency: "INR",
            createdAt: "2026-11-19T09:00:00.000Z",
          },
        ],
        refunds: [],
        invoices: [],
      },
    })),
    processRefund: vi.fn(async (paymentId, input) => ({
      refund: {
        id: 1,
        paymentId,
        refundNumber: "REF-20261119-001",
        status: "processed" as const,
        amountPaise: input.amountPaise,
        reason: input.reason,
        createdAt: "2026-11-19T10:00:00.000Z",
      },
      payment: {
        id: paymentId,
        paymentNumber: "PAY-20261119-001",
        customerId: data.order.customerId,
        orderId: data.order.id,
        paymentMethod: "cash" as const,
        status: "refunded" as const,
        amountPaise: input.amountPaise,
        capturedAmountPaise: input.amountPaise,
        refundedAmountPaise: input.amountPaise,
        currency: "INR",
        createdAt: "2026-11-19T09:00:00.000Z",
      },
    })),
    getCustomerBilling: vi.fn(async (customerId) => ({
      customerId,
      totalOrdersCount: 1,
      totalBilledPaise: data.order.totalAmountPaise,
      capturedAmountPaise: 0,
      refundedAmountPaise: 0,
      netPaidAmountPaise: 0,
      outstandingDuePaise: data.order.totalAmountPaise,
      paymentStatus: "has_due" as const,
    })),
    sendNotification: vi.fn(async () => ({ success: true, channel: "whatsapp", status: "sent" })),
  };
}

describe("OrderDetailPage Component", () => {
  it("renders order details with milestone stepper, line items, customer details, and invoice docket", async () => {
    const ordersService = createOrdersServiceStub();

    render(
      <MemoryRouter initialEntries={["/orders/42"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={<OrderDetailPage ordersService={ordersService} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("ORD-20261119-TEST42").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText("Kiran Verma").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Men's Formal Shirt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Tax Invoice Docket")).toBeInTheDocument();
    expect(screen.getByText("Start Processing")).toBeInTheDocument();
    expect(screen.getByText("Customer confirmed color fastness")).toBeInTheDocument();
  });

  it("handles status transition when Start Processing button is clicked", async () => {
    const ordersService = createOrdersServiceStub();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/orders/42"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={<OrderDetailPage ordersService={ordersService} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Start Processing")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Start Processing"));

    await waitFor(() => {
      expect(ordersService.transitionStatus).toHaveBeenCalledWith(
        42,
        "processing",
        expect.any(String),
      );
    });
  });

  it("allows staff to post an internal note", async () => {
    const ordersService = createOrdersServiceStub();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/orders/42"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={<OrderDetailPage ordersService={ordersService} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type an internal note/i)).toBeInTheDocument();
    });

    const noteInput = screen.getByPlaceholderText(/Type an internal note/i);
    await user.type(noteInput, "Checked collar buttons");
    await user.click(screen.getByText("Post Note"));

    await waitFor(() => {
      expect(ordersService.addNote).toHaveBeenCalledWith(42, "Checked collar buttons");
    });
  }, 15000);

  it("opens hold dialog when Put on Hold button is clicked", async () => {
    const ordersService = createOrdersServiceStub();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/orders/42"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={<OrderDetailPage ordersService={ordersService} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Put on Hold")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Put on Hold"));

    await waitFor(() => {
      expect(screen.getByText("Put Order On Hold")).toBeInTheDocument();
      expect(screen.getByText("Confirm Hold")).toBeInTheDocument();
    });
  });

  it("renders payment settlement breakdown and allows staff to record a payment", async () => {
    const ordersService = createOrdersServiceStub();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/orders/42"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={<OrderDetailPage ordersService={ordersService} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Payment & Settlement")).toBeInTheDocument();
      expect(screen.getByText("Total Billed")).toBeInTheDocument();
      expect(screen.getByText("Amount Paid")).toBeInTheDocument();
      expect(screen.getAllByText("Balance Due").length).toBeGreaterThanOrEqual(1);
    });

    // Click Record Payment CTA button
    const recordPaymentBtn = screen.getByRole("button", {
      name: /Record Payment/i,
    });
    expect(recordPaymentBtn).toBeInTheDocument();
    await user.click(recordPaymentBtn);

    // Modal should be visible
    await waitFor(() => {
      expect(screen.getByText("Record Customer Payment")).toBeInTheDocument();
    });

    // Select UPI method
    const upiBtn = screen.getByRole("button", { name: /UPI \/ QR/i });
    await user.click(upiBtn);

    // Type a note
    const noteInput = screen.getByPlaceholderText(/UPI Ref #/i);
    await user.type(noteInput, "UPI Ref #987654");

    // Click Confirm Payment
    const confirmBtn = screen.getByRole("button", { name: /Confirm Payment/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(ordersService.recordPayment).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          paymentMethod: "upi",
          amountPaise: 35400,
          notes: "UPI Ref #987654",
        }),
      );
    });
  });

  it("renders payment transactions in ledger and allows staff to process a refund", async () => {
    const mockOrderWithPayment: OrderDetail = {
      ...MOCK_ORDER_DETAIL,
    };
    const ordersService = createOrdersServiceStub(mockOrderWithPayment);
    ordersService.getOrderBilling = vi.fn(async () => ({
      orderId: 42,
      orderNumber: "ORD-20261119-TEST42",
      customerId: 101,
      totalAmountPaise: 35400,
      capturedAmountPaise: 35400,
      refundedAmountPaise: 0,
      netPaidAmountPaise: 35400,
      balanceDuePaise: 0,
      paymentStatus: "paid" as const,
      payments: [
        {
          id: 99,
          paymentNumber: "PAY-20261119-99",
          customerId: 101,
          orderId: 42,
          paymentMethod: "cash" as const,
          status: "captured" as const,
          amountPaise: 35400,
          capturedAmountPaise: 35400,
          refundedAmountPaise: 0,
          currency: "INR",
          createdAt: "2026-11-19T09:00:00.000Z",
        },
      ],
      refunds: [],
      invoices: [],
    }));

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/orders/42"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={<OrderDetailPage ordersService={ordersService} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("PAY-20261119-99")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refund" })).toBeInTheDocument();
    });

    // Click Refund
    await user.click(screen.getByRole("button", { name: "Refund" }));

    await waitFor(() => {
      expect(screen.getByText("Process Payment Refund")).toBeInTheDocument();
    });

    // Select a preset reason
    const reasonChip = screen.getByRole("button", { name: "Order Cancellation" });
    await user.click(reasonChip);

    // Issue refund
    const issueRefundBtn = screen.getByRole("button", { name: /Issue Refund/i });
    await user.click(issueRefundBtn);

    await waitFor(() => {
      expect(ordersService.processRefund).toHaveBeenCalledWith(
        99,
        expect.objectContaining({
          amountPaise: 35400,
          reason: "Order Cancellation",
        }),
      );
    });
  });

  it("allows staff to cancel an order with reason confirmation", async () => {
    const ordersService = createOrdersServiceStub();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/orders/42"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={<OrderDetailPage ordersService={ordersService} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel Order" })).toBeInTheDocument();
    });

    // Open Cancel Order modal
    await user.click(screen.getByRole("button", { name: "Cancel Order" }));

    await waitFor(() => {
      expect(screen.getByText("Cancel Order #ORD-20261119-TEST42")).toBeInTheDocument();
    });

    // Select preset chip
    const presetChip = screen.getByRole("button", { name: "Customer requested cancellation" });
    await user.click(presetChip);

    // Confirm Cancellation
    const confirmBtn = screen.getByRole("button", { name: /Confirm Cancellation/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(ordersService.transitionStatus).toHaveBeenCalledWith(
        42,
        "cancelled",
        "Customer requested cancellation",
      );
    });
  });

  it("allows staff to open edit order dialog and modify garments", async () => {
    const ordersService = createOrdersServiceStub();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/orders/42"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={<OrderDetailPage ordersService={ordersService} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Edit Order" })).toBeInTheDocument();
    });

    // Open Edit Order modal
    await user.click(screen.getByRole("button", { name: "Edit Order" }));

    await waitFor(() => {
      expect(screen.getByText("Edit Order #ORD-20261119-TEST42")).toBeInTheDocument();
      expect(screen.getByText("Garments in Order (1)")).toBeInTheDocument();
    });

    // Save Order Changes
    const saveBtn = screen.getByRole("button", { name: /Save Order Changes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(ordersService.updateOrder).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          lines: expect.any(Array),
        }),
      );
    });
  });

  it("allows staff to print or preview the thermal receipt docket for reprinting", async () => {
    const ordersService = createOrdersServiceStub();
    const user = userEvent.setup();
    const printSpy = vi.fn();
    window.print = printSpy;

    render(
      <MemoryRouter initialEntries={["/orders/42"]}>
        <Routes>
          <Route
            path="/orders/:id"
            element={<OrderDetailPage ordersService={ordersService} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Print Docket/i }).length).toBeGreaterThanOrEqual(1);
    });

    // 1. Click Print Docket button from top command bar
    const printBtn = screen.getAllByRole("button", { name: /Print Docket/i })[0];
    await user.click(printBtn);
    expect(printSpy).toHaveBeenCalled();

    // 2. Click Preview Receipt button to open Thermal Receipt Docket Preview Modal
    const previewBtn = screen.getByRole("button", { name: /Preview Receipt/i });
    await user.click(previewBtn);

    await waitFor(() => {
      expect(screen.getByText("Thermal Receipt Docket Preview")).toBeInTheDocument();
      expect(screen.getAllByText("*** REPRINT / DUPLICATE RECEIPT ***").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Scan to track order").length).toBeGreaterThanOrEqual(1);
    });
  });
});
