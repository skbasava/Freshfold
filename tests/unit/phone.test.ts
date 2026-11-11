import { describe, expect, it } from "vitest";
import {
  deriveCustomerId,
  normalizePhone,
} from "../../packages/contracts/src/phone";

describe("normalizePhone", () => {
  it("normalizes Indian 10 digit numbers to E.164", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("98765-43210")).toBe("+919876543210");
    expect(normalizePhone("(98765) 43210")).toBe("+919876543210");
    expect(normalizePhone("98765.43210")).toBe("+919876543210");
  });

  it("normalizes Indian trunk and country prefixes", () => {
    expect(normalizePhone("09876543210")).toBe("+919876543210");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("0091 98765 43210")).toBe("+919876543210");
  });

  it("accepts other international numbers", () => {
    expect(normalizePhone("+1 (415) 555-2671")).toBe("+14155552671");
    expect(normalizePhone("0044 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("12345678")).toBe("+12345678");
  });

  it("rejects letters, empty values and invalid lengths", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("98765abc10")).toBeNull();
    expect(normalizePhone("1234567")).toBeNull();
    expect(normalizePhone("1234567890123456")).toBeNull();
    expect(normalizePhone("12+34567890")).toBeNull();
  });
});

describe("deriveCustomerId", () => {
  it("is stable for the same hub and normalized phone", async () => {
    const first = await deriveCustomerId("hub-1", "+919876543210");
    const second = await deriveCustomerId("hub-1", "+919876543210");

    expect(first).toBe(second);
    expect(first).toMatch(/^cust_[0-9a-f]{32}$/);
  });

  it("differs by hub and phone", async () => {
    const base = await deriveCustomerId("hub-1", "+919876543210");
    const otherPhone = await deriveCustomerId("hub-1", "+919876543211");
    const otherHub = await deriveCustomerId("hub-2", "+919876543210");

    expect(otherPhone).not.toBe(base);
    expect(otherHub).not.toBe(base);
  });
});
