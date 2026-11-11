import { describe, expect, it } from "vitest";
import {
  applyChangeInputSchema,
  applyChangeResultSchema,
} from "../../packages/contracts/src/mutations";
import { orderDetailSchema } from "../../packages/contracts/src/orders";

const base = {
  orderId: "order-1",
  mutationId: "mutation-1",
  baseVersion: null,
};

const slotAndItems = {
  serviceType: "wash_fold",
  deliverySlotId: "slot-1",
  items: [{ description: "Shirt", quantity: 2 }],
};

describe("create order payload contract", () => {
  it("accepts the legacy customerId payload", () => {
    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "createOrder",
        payload: { customerId: "cust-1", ...slotAndItems },
      }).success,
    ).toBe(true);
  });

  it("accepts the new name and phone payload", () => {
    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "createOrder",
        payload: {
          customerName: "  Alice  ",
          customerPhone: " 98765 43210 ",
          ...slotAndItems,
        },
      }).success,
    ).toBe(true);
  });

  it("rejects a payload with both customerId and name or phone", () => {
    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "createOrder",
        payload: {
          customerId: "cust-1",
          customerName: "Alice",
          ...slotAndItems,
        },
      }).success,
    ).toBe(false);

    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "createOrder",
        payload: {
          customerId: "cust-1",
          customerPhone: "9876543210",
          ...slotAndItems,
        },
      }).success,
    ).toBe(false);
  });

  it("enforces name and phone bounds", () => {
    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "createOrder",
        payload: {
          customerName: "   ",
          customerPhone: "9876543210",
          ...slotAndItems,
        },
      }).success,
    ).toBe(false);

    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "createOrder",
        payload: {
          customerName: "Alice",
          customerPhone: "1234567",
          ...slotAndItems,
        },
      }).success,
    ).toBe(false);

    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "createOrder",
        payload: {
          customerName: "Alice",
          customerPhone: "123456789012345678901",
          ...slotAndItems,
        },
      }).success,
    ).toBe(false);
  });
});

describe("applyChange result contract", () => {
  const order = orderDetailSchema.parse({
    id: "order-1",
    hubId: "hub-1",
    customerId: "cust-1",
    customerName: "Alice",
    customerPhone: "+919876543210",
    status: "confirmed",
    serviceType: "wash_fold",
    deliverySlotId: null,
    deliveryAt: null,
    version: 1,
    createdAt: 1000,
    updatedAt: 1000,
    cancelledAt: null,
    holdComment: null,
    customer: {
      id: "cust-1",
      hubId: "hub-1",
      name: "Alice",
      phone: "+919876543210",
      notes: null,
      createdAt: 1000,
      updatedAt: 1000,
    },
    items: [],
  });

  it("requires customerCreated in both fresh and replayed results", () => {
    expect(
      applyChangeResultSchema.safeParse({
        order,
        replayed: false,
        customerCreated: true,
      }).success,
    ).toBe(true);

    expect(
      applyChangeResultSchema.safeParse({
        order,
        replayed: true,
        customerCreated: false,
      }).success,
    ).toBe(true);

    expect(
      applyChangeResultSchema.safeParse({ order, replayed: false }).success,
    ).toBe(false);
  });
});
