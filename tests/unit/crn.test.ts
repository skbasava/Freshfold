import { describe, expect, it } from "vitest";
import {
  CRN_HUB_MAX,
  CRN_ORDER_MAX,
  CRN_TENANT_MAX,
  crnStringSchema,
  formatCrn,
  isValidCrn,
  orderStateSnapshotSchema,
  packCrn,
  parseCrn,
  unpackCrn,
} from "../../packages/contracts/src/crn";

describe("CRN Bit Packing and Utilities", () => {
  it("packs and unpacks minimal values (0, 0, 0)", () => {
    const components = { tenantId: 0, hubId: 0, orderId: 0 };
    const packed = packCrn(components);
    expect(packed).toBe(0);

    const unpacked = unpackCrn(packed);
    expect(unpacked).toEqual(components);
  });

  it("packs and unpacks maximum values (511, 15, 524287)", () => {
    const components = {
      tenantId: CRN_TENANT_MAX,
      hubId: CRN_HUB_MAX,
      orderId: CRN_ORDER_MAX,
    };
    const packed = packCrn(components);
    expect(packed).toBe(0xffffffff); // 4294967295

    const unpacked = unpackCrn(packed);
    expect(unpacked).toEqual(components);
  });

  it("packs and unpacks arbitrary values correctly", () => {
    const components = { tenantId: 42, hubId: 7, orderId: 104523 };
    const packed = packCrn(components);
    expect(packed).toBeGreaterThan(0);

    const unpacked = unpackCrn(packed);
    expect(unpacked).toEqual(components);
  });

  it("throws when packing out-of-range tenantId (> 511)", () => {
    expect(() =>
      packCrn({ tenantId: 512, hubId: 0, orderId: 0 }),
    ).toThrow();
  });

  it("throws when packing out-of-range hubId (> 15)", () => {
    expect(() =>
      packCrn({ tenantId: 0, hubId: 16, orderId: 0 }),
    ).toThrow();
  });

  it("throws when packing out-of-range orderId (> 524287)", () => {
    expect(() =>
      packCrn({ tenantId: 0, hubId: 0, orderId: 524288 }),
    ).toThrow();
  });

  it("formats and parses canonical URN string", () => {
    const formatted = formatCrn({ tenantId: 9, hubId: 2, orderId: 304 });
    expect(formatted).toBe("crn:9:2:304");

    const parsed = parseCrn("crn:9:2:304");
    expect(parsed).toEqual({ tenantId: 9, hubId: 2, orderId: 304 });
  });

  it("validates CRN string correctly", () => {
    expect(isValidCrn("crn:1:0:42")).toBe(true);
    expect(isValidCrn("crn:511:15:524287")).toBe(true);
    expect(isValidCrn("crn:512:0:0")).toBe(false); // Tenant > 511
    expect(isValidCrn("crn:0:16:0")).toBe(false); // Hub > 15
    expect(isValidCrn("crn:0:0:524288")).toBe(false); // Order > 524287
    expect(isValidCrn("invalid-crn")).toBe(false);
  });

  it("validates crnStringSchema correctly", () => {
    expect(crnStringSchema.safeParse("crn:10:4:9999").success).toBe(true);
    expect(crnStringSchema.safeParse("crn:999:0:0").success).toBe(false);
    expect(crnStringSchema.safeParse("not-a-crn").success).toBe(false);
  });

  it("validates orderStateSnapshotSchema correctly", () => {
    const validSnapshot = {
      crnId: "crn:1:0:42",
      orderId: "ord_123",
      tenantId: "tenant-mumbai",
      hubId: "hub-bandra",
      previousState: "confirmed",
      currentState: "processing",
      intent: "markProcessing",
      version: 2,
      changedAt: 1731600000000,
      actor: {
        actorType: "user" as const,
        actorId: "usr_staff_01",
        role: "counter_staff",
      },
      diagnostic: {
        status: "healthy" as const,
        reason: null,
        brokenStep: null,
        lastMutationId: "mut_xyz",
      },
    };

    const parsed = orderStateSnapshotSchema.safeParse(validSnapshot);
    expect(parsed.success).toBe(true);
  });

  it("validates orderStateSnapshotSchema with broken diagnostic status", () => {
    const brokenSnapshot = {
      crnId: "crn:1:0:42",
      orderId: "ord_123",
      tenantId: "tenant-mumbai",
      hubId: "hub-bandra",
      previousState: "processing",
      currentState: "hold",
      intent: "placeOnHold",
      version: 3,
      changedAt: 1731600000000,
      actor: {
        actorType: "user" as const,
        actorId: "usr_staff_01",
      },
      diagnostic: {
        status: "held" as const,
        reason: "Stain requires customer confirmation",
        brokenStep: "placeOnHold",
        lastMutationId: "mut_hold_01",
      },
    };

    const parsed = orderStateSnapshotSchema.safeParse(brokenSnapshot);
    expect(parsed.success).toBe(true);
  });
});

