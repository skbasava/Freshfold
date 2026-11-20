import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemsPage } from "./ItemsPage";

const MOCK_ITEMS = [
  {
    id: 1,
    categoryId: 1,
    code: "ITM-SHIRT",
    name: "Men's Formal Shirt",
    description: "Cotton / Linen",
    hsnSacCode: "999712",
    active: true,
    imageR2Key: null,
    createdAt: "2026-11-19T08:00:00.000Z",
    updatedAt: "2026-11-19T08:00:00.000Z",
  },
  {
    id: 2,
    categoryId: 1,
    code: "ITM-SAREE",
    name: "Silk Saree",
    description: "Dry Clean Only",
    hsnSacCode: "999712",
    active: true,
    imageR2Key: null,
    createdAt: "2026-11-19T08:00:00.000Z",
    updatedAt: "2026-11-19T08:00:00.000Z",
  },
  {
    id: 3,
    categoryId: 2,
    code: "ITM-BEDSHEET",
    name: "Bedsheet Double",
    description: "Heavy Linen",
    hsnSacCode: "999712",
    active: false,
    imageR2Key: null,
    createdAt: "2026-11-19T08:00:00.000Z",
    updatedAt: "2026-11-19T08:00:00.000Z",
  },
];

const MOCK_CATEGORIES = [
  { id: 1, code: "GARMENTS", name: "Garments", sortOrder: 1, active: true },
  { id: 2, code: "HOUSEHOLD", name: "Household", sortOrder: 2, active: true },
];

const MOCK_SERVICES = [
  {
    id: 1,
    categoryId: 1,
    code: "WASH_FOLD",
    name: "Wash & Fold",
    defaultPricingBasis: "per_kg" as const,
    turnaroundHours: 48,
    active: true,
  },
  {
    id: 2,
    categoryId: 1,
    code: "DRY_CLEAN",
    name: "Dry Clean",
    defaultPricingBasis: "per_item" as const,
    turnaroundHours: 72,
    active: true,
  },
  {
    id: 3,
    categoryId: 1,
    code: "STEAM_IRON",
    name: "Steam Iron",
    defaultPricingBasis: "per_item" as const,
    turnaroundHours: 24,
    active: true,
  },
];

const MOCK_RATES = [
  {
    id: 1,
    rateCardId: 1,
    serviceId: 2,
    itemId: 1,
    pricingBasis: "per_item" as const,
    unitPricePaise: 12000,
    minQuantity: null,
  },
  {
    id: 2,
    rateCardId: 1,
    serviceId: 2,
    itemId: 2,
    pricingBasis: "per_item" as const,
    unitPricePaise: 25000,
    minQuantity: null,
  },
  {
    id: 3,
    rateCardId: 1,
    serviceId: 3,
    itemId: 1,
    pricingBasis: "per_item" as const,
    unitPricePaise: 4000,
    minQuantity: null,
  },
  {
    id: 4,
    rateCardId: 1,
    serviceId: 1,
    itemId: null,
    pricingBasis: "per_kg" as const,
    unitPricePaise: 8000,
    minQuantity: null,
  },
];

vi.mock("@/lib/http/api-client", () => ({
  apiFetch: vi.fn(async (path: string, options?: RequestInit) => {
    if (path.includes("/api/v1/items?")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { items: MOCK_ITEMS } }),
      };
    }
    if (path.includes("/api/v1/item-categories")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: MOCK_CATEGORIES }),
      };
    }
    if (path.includes("/api/v1/services")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: MOCK_SERVICES }),
      };
    }
    if (path.includes("/api/v1/rate-cards")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: MOCK_RATES, rateCard: { id: 1 } }),
      };
    }
    if (path.includes("/api/v1/items/") && options?.method === "PATCH") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 1, active: false } }),
      };
    }
    if (path === "/api/v1/items" && options?.method === "POST") {
      const body = JSON.parse((options.body as string) || "{}");
      return {
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 10,
            categoryId: body.categoryId || 1,
            code: body.code || "ITM-TEST",
            name: body.name,
            hsnSacCode: body.hsnSacCode || "999712",
            active: true,
          },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    };
  }),
  registerAccessTokenRefresher: vi.fn(),
}));

describe("ItemsPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders garments and rate card table with SAC codes and service prices", async () => {
    render(
      <MemoryRouter>
        <ItemsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Items & Rate Cards")).toBeInTheDocument();
    expect(screen.getByText("Men's Formal Shirt")).toBeInTheDocument();
    expect(screen.getByText("Silk Saree")).toBeInTheDocument();
    expect(screen.getByText("Bedsheet Double")).toBeInTheDocument();
    expect(screen.getByText("Total Items")).toBeInTheDocument();
  });

  it("filters garments by search query", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ItemsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Men's Formal Shirt")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search garments by name/i);
    await user.type(searchInput, "Saree");

    await waitFor(() => {
      expect(screen.getByText("Silk Saree")).toBeInTheDocument();
      expect(screen.queryByText("Men's Formal Shirt")).not.toBeInTheDocument();
    });
  });

  it("opens Add New Item dialog and registers a new garment", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ItemsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add New Item" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Add New Item" }));

    await waitFor(() => {
      expect(screen.getByText("Add Garment Item & Rate Card")).toBeInTheDocument();
    });

    // Enter name
    const nameInput = screen.getByPlaceholderText(/Silk Kurta, Blazer/i);
    await user.type(nameInput, "Woolen Coat");

    // Click register button
    const submitBtn = screen.getByRole("button", { name: /Register Garment Item/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByText("Add Garment Item & Rate Card")).not.toBeInTheDocument();
    });
  });
});
