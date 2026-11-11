import { describe, expect, it } from "vitest";
import { applyChangeInputSchema } from "../../packages/contracts/src/mutations";
import { permissionForIntent } from "../../workers/laundry/src/domain/intents";
import { nextStatus } from "../../workers/laundry/src/domain/state-machine";

describe("order state machine", () => {
  it("allows the fulfillment sequence", () => {
    expect(nextStatus("confirmed", "markProcessing")).toBe("processing");
    expect(nextStatus("processing", "markOutForDelivery")).toBe(
      "out_for_delivery",
    );
    expect(nextStatus("out_for_delivery", "markDelivered")).toBe("delivered");
  });

  it("supports hold and resume", () => {
    expect(nextStatus("confirmed", "placeOnHold")).toBe("hold");
    expect(nextStatus("processing", "placeOnHold")).toBe("hold");
    expect(nextStatus("hold", "releaseHold")).toBe("processing");
    expect(nextStatus("hold", "placeOnHold")).toBeNull();
    expect(nextStatus("hold", "markProcessing")).toBeNull();
  });

  it("rejects backward and repeated transitions", () => {
    expect(nextStatus("processing", "markProcessing")).toBeNull();
    expect(nextStatus("out_for_delivery", "markOutForDelivery")).toBeNull();
    expect(nextStatus("delivered", "markDelivered")).toBeNull();
    expect(nextStatus("cancelled", "cancel")).toBeNull();
  });

  it("allows rescheduling only while the order is active", () => {
    expect(nextStatus("confirmed", "reschedule")).toBe("confirmed");
    expect(nextStatus("processing", "reschedule")).toBe("processing");
    expect(nextStatus("hold", "reschedule")).toBe("hold");
    expect(nextStatus("out_for_delivery", "reschedule")).toBeNull();
    expect(nextStatus("delivered", "reschedule")).toBeNull();
    expect(nextStatus("cancelled", "reschedule")).toBeNull();
  });

  it("allows cancellation before dispatch only", () => {
    expect(nextStatus("confirmed", "cancel")).toBe("cancelled");
    expect(nextStatus("processing", "cancel")).toBe("cancelled");
    expect(nextStatus("hold", "cancel")).toBe("cancelled");
    expect(nextStatus("out_for_delivery", "cancel")).toBeNull();
    expect(nextStatus("delivered", "cancel")).toBeNull();
  });

  it("maps intents to permissions", () => {
    expect(permissionForIntent("createOrder")).toBe("create_order");
    expect(permissionForIntent("reschedule")).toBe("reschedule_order");
    expect(permissionForIntent("markProcessing")).toBe("update_order_status");
    expect(permissionForIntent("placeOnHold")).toBe("update_order_status");
    expect(permissionForIntent("releaseHold")).toBe("update_order_status");
    expect(permissionForIntent("markOutForDelivery")).toBe(
      "update_order_status",
    );
    expect(permissionForIntent("markDelivered")).toBe("update_order_status");
    expect(permissionForIntent("cancel")).toBe("cancel_order");
  });
});

describe("applyChange contract", () => {
  const base = {
    orderId: "order-1",
    mutationId: "mutation-1",
  };

  it("rejects arbitrary status patches", () => {
    const result = applyChangeInputSchema.safeParse({
      ...base,
      intent: "setStatus",
      payload: { status: "delivered" },
      baseVersion: 1,
    });

    expect(result.success).toBe(false);
  });

  it("requires a null baseVersion for create and an integer for updates", () => {
    const createPayload = {
      customerId: "cust-1",
      serviceType: "wash_fold",
      deliverySlotId: "slot-1",
      items: [{ description: "Shirt", quantity: 2 }],
    };

    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "createOrder",
        payload: createPayload,
        baseVersion: 1,
      }).success,
    ).toBe(false);

    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "markProcessing",
        payload: {},
        baseVersion: null,
      }).success,
    ).toBe(false);
  });

  it("requires a non-blank comment when placing an order on hold", () => {
    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "placeOnHold",
        payload: { comments: "Waiting for customer" },
        baseVersion: 1,
      }).success,
    ).toBe(true);

    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "placeOnHold",
        payload: {},
        baseVersion: 1,
      }).success,
    ).toBe(false);

    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "placeOnHold",
        payload: { comments: "   " },
        baseVersion: 1,
      }).success,
    ).toBe(false);
  });

  it("accepts valid create and update payloads", () => {
    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "createOrder",
        payload: {
          customerId: "cust-1",
          serviceType: "wash_fold",
          deliverySlotId: "slot-1",
          items: [{ description: "Shirt", quantity: 2 }],
        },
        baseVersion: null,
      }).success,
    ).toBe(true);

    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "reschedule",
        payload: { deliverySlotId: "slot-2" },
        baseVersion: 1,
      }).success,
    ).toBe(true);

    expect(
      applyChangeInputSchema.safeParse({
        ...base,
        intent: "releaseHold",
        payload: {},
        baseVersion: 1,
      }).success,
    ).toBe(true);
  });
});
