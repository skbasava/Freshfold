import { describe, expect, it } from "vitest";
import {
  changeFeedQuerySchema,
  changeFeedResponseSchema,
  orderEventSchema,
} from "../../packages/contracts/src/changes";

const order = {
  id: "order-1",
  hubId: "hub-1",
  customerId: "cust-1",
  customerName: "Alice",
  customerPhone: "9000000001",
  status: "confirmed" as const,
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
    phone: "9000000001",
    notes: null,
    createdAt: 1000,
    updatedAt: 1000,
  },
  items: [],
};

describe("change feed contracts", () => {
  it("defaults the feed query and coerces values", () => {
    expect(changeFeedQuerySchema.parse({})).toEqual({
      since: 0,
      limit: 100,
    });
    expect(changeFeedQuerySchema.parse({ since: "12", limit: "200" })).toEqual({
      since: 12,
      limit: 200,
    });
  });

  it("rejects invalid feed cursors and limits", () => {
    expect(changeFeedQuerySchema.safeParse({ since: -1 }).success).toBe(false);
    expect(changeFeedQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
  });

  it("accepts an upsert with a full order and a delete tombstone", () => {
    const response = changeFeedResponseSchema.parse({
      changes: [
        {
          sequence: 1,
          hubId: "hub-1",
          orderId: "order-1",
          version: 1,
          operation: "upsert",
          changedAt: 1000,
          order,
        },
        {
          sequence: 2,
          hubId: "hub-1",
          orderId: "order-1",
          version: 2,
          operation: "delete",
          changedAt: 2000,
          order: null,
        },
      ],
      nextCursor: 2,
      hasMore: false,
    });

    expect(response.changes[0]?.operation).toBe("upsert");
    expect(response.changes[1]?.operation).toBe("delete");
  });

  it("parses audit event details", () => {
    const event = orderEventSchema.parse({
      id: "event-1",
      hubId: "hub-1",
      orderId: "order-1",
      mutationId: "mutation-1",
      eventType: "createOrder",
      source: "app",
      actorType: "user",
      actorId: "user-1",
      previousVersion: 0,
      newVersion: 1,
      at: 1000,
      detail: { intent: "createOrder" },
    });

    expect(event.detail).toEqual({ intent: "createOrder" });
  });
});
