import { describe, expect, it } from "vitest";
import { createMockApi } from "./api";

function managerApi() {
  return createMockApi({ latencyMs: 0, syncIssues: false, role: "manager" });
}

describe("mock order reads", () => {
  it("searches, filters, sorts and paginates orders", async () => {
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    const firstPage = await api.listOrders({ pageSize: 4 });

    expect(firstPage.total).toBe(6);
    expect(firstPage.pageCount).toBe(2);
    expect(firstPage.items).toHaveLength(4);

    const search = await api.listOrders({ search: "rahul" });
    expect(search.items.map((order) => order.id)).toEqual(["ORD-1042"]);

    const hold = await api.listOrders({ status: "hold" });
    expect(hold.items.map((order) => order.id)).toEqual(["ORD-1045"]);

    const byDelivery = await api.listOrders({ sort: "delivery" });
    expect(byDelivery.items[0].id).toBe("ORD-1046");
  });

  it("returns a detailed order with items and customer", async () => {
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    const order = await api.getOrder("ORD-1042");

    expect(order?.customer.name).toBe("Rahul Mehta");
    expect(order?.items.map((item) => item.description)).toContain("Bed sheet");
    expect(order?.version).toBe(4);
  });
});

describe("mock order mutations", () => {
  it("validates create input and rejects a full delivery slot", async () => {
    const api = managerApi();

    await expect(
      api.createOrder({
        customerId: "",
        serviceType: "",
        deliverySlotId: "",
        items: [],
      }),
    ).rejects.toMatchObject({ status: 422, code: "VALIDATION_ERROR" });

    await expect(
      api.createOrder({
        customerId: "C-238",
        serviceType: "Wash and fold",
        deliverySlotId: "slot-1200",
        items: [{ description: "Shirt", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ status: 422, code: "SLOT_FULL" });

    const created = await api.createOrder({
      customerId: "C-238",
      serviceType: "Wash and fold",
      deliverySlotId: "slot-1400",
      items: [{ description: "Shirt", quantity: 2 }],
    });

    expect(created.id).toMatch(/^ORD-/);
    expect(created.status).toBe("confirmed");
    expect(created.version).toBe(1);
    expect((await api.listOrders()).total).toBe(7);
  });

  it("denies manager-only reschedule and cancel to the front desk", async () => {
    const api = createMockApi({
      latencyMs: 0,
      syncIssues: false,
      role: "front_desk",
    });

    await expect(
      api.applyOrderIntent(
        "ORD-1043",
        "reschedule",
        { deliverySlotId: "slot-1400" },
        2,
      ),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });

    await expect(
      api.applyOrderIntent("ORD-1043", "cancel", {}, 2),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("reschedules for a manager and releases the old slot", async () => {
    const api = managerApi();
    const before = await api.getDeliverySchedule("2026-11-11");
    const oldSlot = before.slots.find((slot) => slot.id === "slot-1800");
    const target = before.slots.find((slot) => slot.id === "slot-1400");

    const updated = await api.applyOrderIntent(
      "ORD-1043",
      "reschedule",
      { deliverySlotId: "slot-1400" },
      2,
    );

    expect(updated.deliverySlotId).toBe("slot-1400");
    expect(updated.version).toBe(3);

    const after = await api.getDeliverySchedule("2026-11-11");
    expect(
      after.slots.find((slot) => slot.id === "slot-1400")?.booked,
    ).toBe((target?.booked ?? 0) + 1);
    expect(after.slots.find((slot) => slot.id === "slot-1800")?.booked).toBe(
      Math.max(0, (oldSlot?.booked ?? 0) - 1),
    );
  });

  it("rejects a full slot and an invalid transition", async () => {
    const api = managerApi();

    await expect(
      api.applyOrderIntent(
        "ORD-1043",
        "reschedule",
        { deliverySlotId: "slot-1200" },
        2,
      ),
    ).rejects.toMatchObject({ status: 422, code: "SLOT_FULL" });

    await expect(
      api.applyOrderIntent("ORD-1043", "markDelivered", {}, 2),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_TRANSITION" });
  });

  it("requires a comment before placing an order on hold", async () => {
    const api = managerApi();

    await expect(
      api.applyOrderIntent(
        "ORD-1043",
        "placeOnHold",
        { comments: "   " },
        2,
      ),
    ).rejects.toMatchObject({ status: 422, code: "HOLD_COMMENT_REQUIRED" });

    const held = await api.applyOrderIntent(
      "ORD-1043",
      "placeOnHold",
      { comments: "Customer asked us to check a stain." },
      2,
    );

    expect(held.status).toBe("hold");
    expect(held.holdComment).toBe("Customer asked us to check a stain.");
  });

  it("returns a version conflict when the base version is stale", async () => {
    const api = managerApi();

    await expect(
      api.applyOrderIntent("ORD-1043", "markProcessing", {}, 99),
    ).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
  });

  it("marks offline mutations as pending rather than confirmed", async () => {
    const api = managerApi();

    const held = await api.applyOrderIntent(
      "ORD-1043",
      "placeOnHold",
      { comments: "Waiting for the customer." },
      2,
      { online: false },
    );

    expect(held.syncState).toBe("pending");
  });
});

describe("mock delivery schedule", () => {
  it("shows full, closed and past slot states", async () => {
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    const today = await api.getDeliverySchedule("2026-11-11");

    expect(today.slots.find((slot) => slot.id === "slot-1200")).toMatchObject({
      status: "full",
      available: 0,
    });
    expect(
      today.orders.some((order) => order.customerName === "Anita Rao"),
    ).toBe(true);

    const tomorrow = await api.getDeliverySchedule("2026-11-12");
    expect(tomorrow.slots.find((slot) => slot.id === "slot-1602")?.status).toBe(
      "full",
    );
    expect(tomorrow.slots.find((slot) => slot.id === "slot-1802")?.status).toBe(
      "closed",
    );

    const past = await api.getDeliverySchedule("2026-11-10");
    expect(past.slots.every((slot) => slot.status === "past")).toBe(true);
  });
});

describe("mock customers", () => {
  it("searches customers and returns their order history", async () => {
    const api = createMockApi({ latencyMs: 0, syncIssues: false });
    const results = await api.listCustomers({ search: "meera" });

    expect(results.total).toBe(1);
    expect(results.items[0].name).toBe("Meera Iyer");

    const detail = await api.getCustomer("C-238");
    expect(detail?.customer.name).toBe("Rahul Mehta");
    expect(detail?.orders.map((order) => order.id)).toContain("ORD-1042");
  });
});
