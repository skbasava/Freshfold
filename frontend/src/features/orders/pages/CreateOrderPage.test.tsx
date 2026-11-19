import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/App";
import type { AuthService, AuthSession } from "@/features/auth";
import { CreateOrderPage } from "./CreateOrderPage";
import type { OrdersService } from "../services/orders.service";

const MOCK_SESSION: AuthSession = {
  accessToken: "test-access-token",
  rcVersion: "1.0.0",
  tenantEnabled: false,
  hubEnabled: false,
  user: {
    id: "user-1",
    email: "priya.manager@freshfold.in",
    displayName: "Priya Manager",
    role: "manager",
    hubId: "hub-1",
    hubName: "Main Hub",
    tenantId: "tenant-1",
  },
};

function createStubAuthService(): AuthService {
  return {
    async getSession() {
      return { kind: "authenticated", session: MOCK_SESSION };
    },
    onAuthStateChange(listener) {
      listener({ kind: "authenticated", session: MOCK_SESSION });
      return () => {};
    },
    async signInWithPassword() {
      return { ok: true };
    },
    async signInWithGoogle() {
      return { ok: true };
    },
    async exchangeOAuthCallback() {
      return { ok: true };
    },
    async requestPasswordReset() {
      return { ok: true };
    },
    async updatePassword() {
      return { ok: true };
    },
    async refreshAccessToken() {
      return null;
    },
    async signOut() {},
  };
}

vi.mock("@/lib/http/api-client", () => ({
  registerAccessTokenRefresher: vi.fn(),
  apiFetch: vi.fn(async (path: string) => {
    if (path.includes("/api/v1/customers")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 1,
              fullName: "Anand Kumar",
              phone: "9876543210",
              customerCode: "CUST-001",
            },
          ],
        }),
      };
    }
    if (path.includes("/api/v1/services")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 1,
              name: "Dry Clean",
              code: "dry_clean",
              defaultPricingBasis: "per_item",
            },
          ],
        }),
      };
    }
    if (path.includes("/api/v1/items")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: 1,
              name: "Silk Saree",
              code: "SAREE",
              categoryId: 1,
            },
          ],
        }),
      };
    }
    if (path.includes("/api/v1/rate-cards/1/items")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              serviceId: 1,
              itemId: 1,
              unitPricePaise: 25000,
            },
          ],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    };
  }),
}));

const mockOrdersService: OrdersService = {
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  calculateQuote: vi.fn(async () => ({
    branchId: 1,
    customerId: 1,
    rateCardId: 1,
    supplierStateCode: "29",
    placeOfSupplyStateCode: "29",
    taxSupplyType: "intra_state" as const,
    lines: [
      {
        serviceNameSnapshot: "Dry Clean",
        itemNameSnapshot: "Silk Saree",
        hsnSacCodeSnapshot: "999712",
        grossAmountPaise: 9900,
        discountPaise: 0,
        taxableAmountPaise: 9900,
        totalTaxPaise: 1782,
        lineTotalPaise: 11682,
      },
    ],
    subtotalPaise: 9900,
    discountPaise: 0,
    taxableAmountPaise: 9900,
    cgstPaise: 891,
    sgstPaise: 891,
    igstPaise: 0,
    totalTaxPaise: 1782,
    totalAmountPaise: 11682,
  })),
  createOrder: vi.fn(async () => ({
    order: {
      id: 101,
      branchId: 1,
      rateCardId: 1,
      orderNumber: "ORD-20261119-0101",
      customerId: 1,
      customerName: "Anand Kumar",
      customerPhone: "9876543210",
      pickupAddressId: null,
      deliveryAddressId: null,
      currency: "INR",
      supplierStateCode: "29",
      placeOfSupplyStateCode: "29",
      taxSupplyType: "intra_state" as const,
      status: "confirmed" as const,
      subtotalPaise: 9900,
      discountPaise: 0,
      taxableAmountPaise: 9900,
      cgstPaise: 891,
      sgstPaise: 891,
      igstPaise: 0,
      totalTaxPaise: 1782,
      totalAmountPaise: 11682,
      adjustmentsPaise: 0,
      primaryService: "Dry Clean",
      promisedDeliveryAt: "2026-11-21T18:00:00.000Z",
      specialInstructions: null,
      createdAt: "2026-11-19T10:00:00.000Z",
      updatedAt: "2026-11-19T10:00:00.000Z",
    },
    items: [
      {
        id: 1,
        serviceId: 1,
        itemId: 1,
        pricingBasis: "per_item" as const,
        quantityPieces: 1,
        weightGrams: null,
        unitPricePaise: 9900,
        grossAmountPaise: 9900,
        discountPaise: 0,
        taxableAmountPaise: 9900,
        taxRateBps: 1800,
        cgstAmountPaise: 891,
        sgstAmountPaise: 891,
        igstAmountPaise: 0,
        totalTaxPaise: 1782,
        lineTotalPaise: 11682,
        notes: null,
        serviceNameSnapshot: "Dry Clean",
        itemNameSnapshot: "Silk Saree",
        hsnSacCodeSnapshot: "999712",
      },
    ],
    statusHistory: [],
    notes: [],
    adjustments: [],
  })),
  updateOrder: vi.fn(),
  transitionStatus: vi.fn(),
  addNote: vi.fn(),
  getCalendarEvent: vi.fn(async () => null),
  syncCalendarEvent: vi.fn(async () => ({ success: true, eventId: "test_event" })),
  getOrderBilling: vi.fn(async () => ({
    orderId: 101,
    orderNumber: "ORD-20261119-0101",
    customerId: 1,
    totalAmountPaise: 11682,
    capturedAmountPaise: 11682,
    refundedAmountPaise: 0,
    netPaidAmountPaise: 11682,
    balanceDuePaise: 0,
    paymentStatus: "paid" as const,
    payments: [],
    refunds: [],
    invoices: [],
  })),
  recordPayment: vi.fn(async () => ({
    payment: {
      id: 1,
      paymentNumber: "PAY-1",
      customerId: 1,
      orderId: 101,
      paymentMethod: "cash" as const,
      status: "captured" as const,
      amountPaise: 11682,
      capturedAmountPaise: 11682,
      refundedAmountPaise: 0,
      currency: "INR",
      createdAt: "2026-11-19T10:00:00.000Z",
    },
    billing: {
      orderId: 101,
      orderNumber: "ORD-20261119-0101",
      customerId: 1,
      totalAmountPaise: 11682,
      capturedAmountPaise: 11682,
      refundedAmountPaise: 0,
      netPaidAmountPaise: 11682,
      balanceDuePaise: 0,
      paymentStatus: "paid" as const,
      payments: [],
      refunds: [],
      invoices: [],
    },
  })),
  processRefund: vi.fn(),
  getCustomerBilling: vi.fn(),
  sendNotification: vi.fn(async () => ({ success: true, channel: "whatsapp" as const, status: "sent" as const })),
};

describe("CreateOrderPage", () => {
  it("renders POS header and order ticket without crashing", async () => {
    render(
      <MemoryRouter>
        <CreateOrderPage ordersService={mockOrdersService} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Laundry Counter POS")).toBeInTheDocument();
    expect(screen.getByText("Order Ticket")).toBeInTheDocument();
    expect(screen.getByText("+ New Customer")).toBeInTheDocument();
    expect(screen.getByText("+ New Garment")).toBeInTheDocument();
  });

  it("opens Register New Customer dialog when + New Customer button is clicked", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <MemoryRouter>
        <CreateOrderPage ordersService={mockOrdersService} />
      </MemoryRouter>,
    );

    const newCustomerBtn = screen.getByRole("button", { name: /\+ New Customer/i });
    fireEvent.click(newCustomerBtn);

    await waitFor(() => {
      expect(screen.getByText("Register New Customer")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("e.g. Anand Kumar")).toBeInTheDocument();
    });
  });

  it("renders within the App shell at /orders/new", async () => {
    render(
      <MemoryRouter initialEntries={["/orders/new"]}>
        <App
          authService={createStubAuthService()}
          ordersService={mockOrdersService}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Laundry Counter POS")).toBeInTheDocument();
    });
  });

  it("executes the 3-step POS checkout flow: Cart -> Payment -> Print & Notify", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <MemoryRouter>
        <CreateOrderPage ordersService={mockOrdersService} />
      </MemoryRouter>,
    );

    // Wait for catalog to load
    await waitFor(() => {
      expect(screen.getByText("Silk Saree")).toBeInTheDocument();
    });

    // Select customer via mobile lazy search
    const searchInput = screen.getByPlaceholderText(/Search mobile number/i);
    fireEvent.change(searchInput, { target: { value: "987" } });

    await waitFor(() => {
      expect(screen.getAllByText("Anand Kumar").length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getAllByText("Anand Kumar")[0]);

    // Step 1: Add garment to cart
    const garmentButton = screen.getByText("Silk Saree").closest("button");
    expect(garmentButton).toBeTruthy();
    fireEvent.click(garmentButton!);

    // Verify Proceed to Payment button appears and click it
    await waitFor(() => {
      expect(screen.getByText(/Proceed to Payment/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Proceed to Payment/i));

    // Step 2: Payment settlement view
    await waitFor(() => {
      expect(screen.getByText("Step 2: Payment Settlement")).toBeInTheDocument();
      expect(screen.getByText("Collection Mode *")).toBeInTheDocument();
      expect(screen.getByText("Pay in Full")).toBeInTheDocument();
    });

    // Confirm and place order
    const placeOrderBtn = screen.getByRole("button", { name: /Place Order & Collect/i });
    fireEvent.click(placeOrderBtn);

    // Step 3: Print & Notify view
    await waitFor(() => {
      expect(screen.getByText("Step 3: Confirmed & Tagged")).toBeInTheDocument();
      expect(screen.getByText("Print Thermal Receipt Docket")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /WhatsApp/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /SMS/i })).toBeInTheDocument();
      expect(screen.getByText("+ Next Customer / New Order")).toBeInTheDocument();
    });

    // Test WhatsApp notification click
    window.open = vi.fn();
    const whatsappBtn = screen.getByRole("button", { name: /WhatsApp/i });
    fireEvent.click(whatsappBtn);
    await waitFor(() => {
      expect(mockOrdersService.sendNotification).toHaveBeenCalledWith(
        101,
        expect.objectContaining({ channel: "whatsapp" }),
      );
    });

    // Test SMS notification click
    const smsBtn = screen.getByRole("button", { name: /SMS/i });
    fireEvent.click(smsBtn);
    await waitFor(() => {
      expect(mockOrdersService.sendNotification).toHaveBeenCalledWith(
        101,
        expect.objectContaining({ channel: "sms" }),
      );
    });

    // Test Next Customer / New Order reset
    const nextOrderBtn = screen.getByText("+ Next Customer / New Order");
    fireEvent.click(nextOrderBtn);
    await waitFor(() => {
      expect(screen.getByText("Ticket is empty")).toBeInTheDocument();
    });
  });

  it("handles mobile customer lazy search threshold (min 3 digits) and allows changing customer", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <MemoryRouter>
        <CreateOrderPage ordersService={mockOrdersService} />
      </MemoryRouter>,
    );

    const searchInput = screen.getByPlaceholderText(/Search mobile number/i);

    // Typing 1 digit shows 2 more digits needed prompt
    fireEvent.change(searchInput, { target: { value: "9" } });
    expect(screen.getByText(/Type 2 more digits to search/i)).toBeInTheDocument();

    // Typing 2 digits shows 1 more digit needed prompt
    fireEvent.change(searchInput, { target: { value: "98" } });
    expect(screen.getByText(/Type 1 more digit to search/i)).toBeInTheDocument();

    // Typing 3 digits triggers search and displays matching customer
    fireEvent.change(searchInput, { target: { value: "987" } });
    await waitFor(() => {
      expect(screen.getAllByText("Anand Kumar").length).toBeGreaterThanOrEqual(1);
    });

    // Selecting customer renders customer badge
    fireEvent.click(screen.getAllByText("Anand Kumar")[0]);
    await waitFor(() => {
      expect(screen.getByText("9876543210")).toBeInTheDocument();
      expect(screen.getByText("Change")).toBeInTheDocument();
    });

    // Clicking Change re-opens the search input
    fireEvent.click(screen.getByText("Change"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search mobile number/i)).toBeInTheDocument();
    });
  });
});
