import { describe, expect, it } from "vitest";
import {
  customerListResponseSchema,
  listQuerySchema,
  orderDetailSchema,
  orderListResponseSchema,
} from "../../packages/contracts/src/orders";

const customer = {
  id: "cust-1",
  hubId: "hub-1",
  name: "Alice",
  phone: "+919000000001",
  notes: null,
  createdAt: 1000,
  updatedAt: 1000,
};

const orderItem = {
  id: "item-1",
  hubId: "hub-1",
  orderId: "order-1",
  description: "Shirt",
  quantity: 2,
  serviceType: "wash_fold",
  createdAt: 1000,
};

const order = {
  id: "order-1",
  hubId: "hub-1",
  customerId: "cust-1",
  customerName: "Alice",
  customerPhone: "+919000000001",
  status: "confirmed",
  serviceType: "wash_fold",
  deliverySlotId: null,
  deliveryAt: 5000,
  version: 1,
  createdAt: 1000,
  updatedAt: 1000,
  cancelledAt: null,
  holdComment: null,
};

describe("read contracts", () => {
  it("parses customer and order list responses", () => {
    expect(
      customerListResponseSchema.parse({ items: [customer], nextCursor: null }),
    ).toEqual({ items: [customer], nextCursor: null });
    expect(
      orderListResponseSchema.parse({ items: [order], nextCursor: "next" }),
    ).toEqual({ items: [order], nextCursor: "next" });
  });

  it("parses an order detail with items and customer", () => {
    expect(
      orderDetailSchema.parse({ ...order, customer, items: [orderItem] }),
    ).toMatchObject({ id: "order-1", items: [orderItem], customer });
  });

  it("rejects unknown order statuses", () => {
    expect(() =>
      orderListResponseSchema.parse({
        items: [{ ...order, status: "lost" }],
        nextCursor: null,
      }),
    ).toThrow();
  });

  it("bounds deterministic list pagination", () => {
    expect(listQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(listQuerySchema.parse({ limit: "100", cursor: "abc" })).toEqual({
      limit: 100,
      cursor: "abc",
    });
    expect(() => listQuerySchema.parse({ limit: "0" })).toThrow();
    expect(() => listQuerySchema.parse({ limit: "101" })).toThrow();
  });
});
