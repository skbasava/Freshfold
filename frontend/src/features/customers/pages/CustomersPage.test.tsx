import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomersPage, maskPhoneNumber } from "./CustomersPage";

const MOCK_CUSTOMERS = [
  {
    id: 1,
    customerCode: "CUST-1001",
    fullName: "Rajesh Kumar",
    phone: "+919876543210",
    email: "rajesh@example.com",
    gstin: null,
    stateCode: "29",
    isActive: true,
    createdAt: "2026-11-19T08:00:00.000Z",
  },
  {
    id: 2,
    customerCode: "CUST-1002",
    fullName: "Priya Sharma",
    phone: "9876543211",
    email: "priya@corp.in",
    gstin: "29AAAAA0000A1Z5",
    stateCode: "29",
    isActive: true,
    createdAt: "2026-11-19T08:30:00.000Z",
  },
  {
    id: 3,
    customerCode: "CUST-1003",
    fullName: "Amitabh Sen",
    phone: "+919876543212",
    email: null,
    gstin: null,
    stateCode: "29",
    isActive: false,
    createdAt: "2026-11-19T09:00:00.000Z",
  },
];

const MOCK_ORDERS = [
  {
    id: 42,
    orderNumber: "ORD-20261119-TEST42",
    customerId: 1,
    customerName: "Rajesh Kumar",
    customerPhone: "+919876543210",
    primaryService: "Wash & Fold",
    status: "confirmed",
    totalAmountPaise: 45000,
    promisedDeliveryAt: "2026-11-21T10:00:00.000Z",
    specialInstructions: "Light starch",
    createdAt: "2026-11-19T08:00:00.000Z",
    updatedAt: "2026-11-19T08:00:00.000Z",
  },
];

let customerStore = [...MOCK_CUSTOMERS];

vi.mock("@/lib/http/api-client", () => ({
  apiFetch: vi.fn(async (path: string, options?: { method?: string; body?: string }) => {
    // 1. Order History
    if (path.includes("/api/v1/orders")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            items: MOCK_ORDERS,
          },
        }),
      };
    }

    // 2. Customer Full Details (GET /api/v1/customers/:id)
    const singleMatch = path.match(/\/api\/v1\/customers\/(\d+)$/);
    if (singleMatch && (!options || !options.method || options.method === "GET")) {
      const id = Number(singleMatch[1]);
      const cust = customerStore.find((c) => c.id === id) || customerStore[0];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            customer: cust,
            addresses: [
              {
                id: 101,
                customerId: id,
                addressType: "home",
                label: "Primary Residence",
                line1: "Flat 402, Palm View",
                line2: "100ft Road, Indiranagar",
                landmark: "Near Metro",
                city: "Bangalore",
                state: "Karnataka",
                stateCode: "29",
                postalCode: "560038",
                isDefaultPickup: true,
                isDefaultDelivery: true,
                createdAt: "2026-11-19T08:00:00.000Z",
              },
            ],
            preferences: {
              customerId: id,
              detergentPreference: "Eco Friendly Liquid",
              starchLevel: "Medium",
              foldOrHanger: "Folded",
              specialInstructions: "Gentle cycle for shirts",
            },
          },
        }),
      };
    }

    // 3. Customer List
    if (path.includes("/api/v1/customers") && (!options || !options.method || options.method === "GET")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            items: customerStore,
          },
        }),
      };
    }

    // 4. Create Customer (POST)
    if (path.includes("/api/v1/customers") && options?.method === "POST") {
      const parsed = JSON.parse(options.body ?? "{}");
      const created = {
        id: customerStore.length + 1,
        customerCode: parsed.customerCode || "CUST-9999",
        fullName: parsed.fullName,
        phone: parsed.phone,
        email: parsed.email || null,
        gstin: parsed.gstin || null,
        stateCode: parsed.stateCode || "29",
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      customerStore = [...customerStore, created];
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: created }),
      };
    }

    // 5. Update Customer (PATCH)
    if (path.includes("/api/v1/customers/") && options?.method === "PATCH") {
      const match = path.match(/\/api\/v1\/customers\/(\d+)/);
      const id = match ? Number(match[1]) : 1;
      const parsed = JSON.parse(options.body ?? "{}");
      customerStore = customerStore.map((c) =>
        c.id === id ? { ...c, ...parsed } : c,
      );
      const updated = customerStore.find((c) => c.id === id);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: updated }),
      };
    }

    // 6. Address creation
    if (path.includes("/addresses") && options?.method === "POST") {
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 10 } }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ error: { message: "Not found" } }),
    };
  }),
}));

describe("CustomersPage Component", () => {
  beforeEach(() => {
    customerStore = [...MOCK_CUSTOMERS];
  });

  it("renders customer directory with KPI stats, profile list, and masked phone numbers", async () => {
    render(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>,
    );

    // Verify Header and Badges
    await waitFor(() => {
      expect(screen.getByText("Customer Directory")).toBeInTheDocument();
      expect(screen.getByText("3 Profiles")).toBeInTheDocument();
    });

    // Check KPI statistics
    expect(screen.getByText("Total Profiles")).toBeInTheDocument();
    expect(screen.getByText("Active Accounts")).toBeInTheDocument();
    expect(screen.getByText("B2B & GSTIN")).toBeInTheDocument();
    expect(screen.getByText("Inactive Accounts")).toBeInTheDocument();

    // Verify customers rendered
    expect(screen.getByText("Rajesh Kumar")).toBeInTheDocument();
    expect(screen.getByText("CUST-1001")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("29AAAAA0000A1Z5")).toBeInTheDocument();

    // Verify phone masking: +919876543210 -> +91 98••• ••210
    expect(screen.getByText("+91 98••• ••210")).toBeInTheDocument();
  });

  it("filters customer directory by search query", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Rajesh Kumar")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search name, phone, code, GSTIN/i);
    await user.type(searchInput, "Priya");

    // Rajesh should be filtered out, Priya should remain
    expect(screen.queryByText("Rajesh Kumar")).not.toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();

    // Clear search using the clear button
    const clearBtn = screen.getByLabelText("Clear Search");
    await user.click(clearBtn);

    expect(screen.getByText("Rajesh Kumar")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
  });

  it("toggles active and inactive status for a customer", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Rajesh Kumar")).toBeInTheDocument();
    });

    // Find the Active button for Rajesh Kumar (id: 1)
    const activeButtons = screen.getAllByRole("button", { name: /^active$/i });
    expect(activeButtons.length).toBeGreaterThanOrEqual(1);

    // Click to inactivate Rajesh Kumar
    await user.click(activeButtons[0]);

    // Should display alert banner
    await waitFor(() => {
      expect(screen.getByText(/Customer "Rajesh Kumar" marked as Inactive\./i)).toBeInTheDocument();
    });
  });

  it("opens Edit Customer modal dialog and updates customer details", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Rajesh Kumar")).toBeInTheDocument();
    });

    // Find and click the edit button
    const editBtns = screen.getAllByLabelText("Edit Customer");
    await user.click(editBtns[0]);

    // Edit modal should open
    expect(screen.getByText("Edit Customer Profile")).toBeInTheDocument();

    // Modify name
    const nameInput = screen.getByDisplayValue("Rajesh Kumar");
    await user.clear(nameInput);
    await user.type(nameInput, "Rajesh K. Verma");

    // Submit edit form
    const submitBtn = screen.getByRole("button", { name: /Update Customer/i });
    await user.click(submitBtn);

    // Verify customer name updated on page
    await waitFor(() => {
      expect(screen.getByText("Rajesh K. Verma")).toBeInTheDocument();
      expect(screen.getByText(/Customer "Rajesh K\. Verma" updated successfully!/i)).toBeInTheDocument();
    });
  });

  it("opens customer full details modal and displays delivery addresses and entire order history", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Rajesh Kumar")).toBeInTheDocument();
    });

    // Click on customer profile name to open detail modal
    const customerNameEl = screen.getByText("Rajesh Kumar");
    await user.click(customerNameEl);

    // Detail modal should display
    await waitFor(() => {
      expect(screen.getByText("Profile & Addresses")).toBeInTheDocument();
      expect(screen.getByText(/Flat 402, Palm View/i)).toBeInTheDocument();
      expect(screen.getByText("Eco Friendly Liquid")).toBeInTheDocument();
    });

    // Switch to Entire Order History tab
    const ordersTabBtn = screen.getByRole("button", { name: /Entire Order History/i });
    await user.click(ordersTabBtn);

    // Verify order history elements
    await waitFor(() => {
      expect(screen.getByText("ORD-20261119-TEST42")).toBeInTheDocument();
      expect(screen.getByText("Wash & Fold")).toBeInTheDocument();
      expect(screen.getAllByText("₹450.00").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole("button", { name: /Close Profile/i })).toBeInTheDocument();
    });

    // Close modal
    const closeBtn = screen.getByRole("button", { name: /Close Profile/i });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText("Close Profile")).not.toBeInTheDocument();
    });
  });

  it("opens Add Customer modal dialog and creates a new customer", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Customer Directory")).toBeInTheDocument();
    });

    const addBtn = screen.getByRole("button", { name: /Add Customer/i });
    await user.click(addBtn);

    expect(screen.getByText("New Customer Registration")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("e.g. Rajesh Kumar");
    const phoneInput = screen.getByPlaceholderText("e.g. +919876543210");
    await user.type(nameInput, "Kavita Reddy");
    await user.type(phoneInput, "+919988776655");

    const submitBtn = screen.getByRole("button", { name: /Save Customer/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Customer "Kavita Reddy" .* created successfully!/i)).toBeInTheDocument();
    });
  });

  it("masks phone numbers properly according to maskPhoneNumber utility", () => {
    expect(maskPhoneNumber("+919876543210")).toBe("+91 98••• ••210");
    expect(maskPhoneNumber("9876543210")).toBe("98••• ••210");
    expect(maskPhoneNumber("1234")).toBe("1234");
    expect(maskPhoneNumber("")).toBe("");
    expect(maskPhoneNumber(null)).toBe("");
  });
});
