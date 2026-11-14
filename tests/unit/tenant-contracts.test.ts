import { describe, expect, it } from "vitest";
import {
  createTenantRequestSchema,
  tenantListQuerySchema,
  tenantSchema,
  updateTenantRequestSchema,
} from "../../packages/contracts/src/tenants";

describe("Tenant Contracts Validation", () => {
  it("validates a valid createTenant request with defaultHub and settings", () => {
    const input = {
      name: "CleanFold Premium",
      slug: "cleanfold-premium",
      planTier: "pro",
      contactEmail: "admin@cleanfold.com",
      contactPhone: "+919876543210",
      defaultHub: {
        name: "Indiranagar Hub",
        code: "IND",
      },
      settings: {
        currency: "INR",
        taxRatePercent: 18,
        businessHours: { open: "08:00", close: "20:00" },
      },
      metadata: {
        crmId: "CRM-9981",
      },
    };

    const parsed = createTenantRequestSchema.parse(input);
    expect(parsed.name).toBe("CleanFold Premium");
    expect(parsed.slug).toBe("cleanfold-premium");
    expect(parsed.planTier).toBe("pro");
    expect(parsed.defaultHub?.code).toBe("IND");
    expect(parsed.settings).toHaveProperty("currency", "INR");
    expect(parsed.metadata).toHaveProperty("crmId", "CRM-9981");
  });

  it("rejects invalid slugs", () => {
    const invalidInputs = [
      { name: "Test", slug: "Invalid Slug" },
      { name: "Test", slug: "slug_with_underscore" },
      { name: "Test", slug: "slug!@#" },
    ];

    for (const input of invalidInputs) {
      const result = createTenantRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    }
  });

  it("validates tenant update schema with optimistic version", () => {
    const updateInput = {
      name: "CleanFold Express",
      contactPhone: "+919999988888",
      settings: { taxRatePercent: 12 },
      baseVersion: 2,
    };

    const parsed = updateTenantRequestSchema.parse(updateInput);
    expect(parsed.name).toBe("CleanFold Express");
    expect(parsed.baseVersion).toBe(2);
  });

  it("validates tenant entity schema", () => {
    const tenant = {
      id: "ten_12345",
      name: "Acme Laundry",
      slug: "acme-laundry",
      status: "active",
      planTier: "standard",
      settings: { timezone: "Asia/Kolkata" },
      metadata: {},
      contactEmail: "info@acme.com",
      contactPhone: "+919000000000",
      version: 1,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      deletedAt: null,
    };

    const parsed = tenantSchema.parse(tenant);
    expect(parsed.id).toBe("ten_12345");
    expect(parsed.status).toBe("active");
  });

  it("validates tenant list query parameters", () => {
    const query = {
      status: "active",
      limit: "25",
      cursor: "abc123cursor",
    };

    const parsed = tenantListQuerySchema.parse(query);
    expect(parsed.status).toBe("active");
    expect(parsed.limit).toBe(25);
    expect(parsed.cursor).toBe("abc123cursor");
  });
});

