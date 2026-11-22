import { describe, expect, it } from "vitest";
import { createTestHarness } from "../helpers/test-app";

describe("Order Routes — Tenant & Hub Isolation Security", () => {
  it("enforces tenant and hub level data isolation across GET, PUT, PATCH, and POST endpoints", async () => {
    const harness = await createTestHarness();

    const washFoldId = harness.seed.serviceIds["WASH_FOLD"]!;

    // 1. Create Customer 1 (Hub 1)
    const custRes = await harness.request("/api/v1/customers", {
      method: "POST",
      headers: {
        ...harness.managerAuthHeader,
        "content-type": "application/json",
        "x-tenant-id": "1",
        "x-hub-id": "1",
      },
      body: JSON.stringify({
        customerCode: "CUST-ISOLATION-1",
        fullName: "Isolation Test Customer",
        phone: "+919876543210",
      }),
    });
    expect(custRes.status).toBe(201);
    const { data: customer } = (await custRes.json()) as { data: { id: number } };

    // 2. Create Order in Tenant 1, Hub 1
    const orderRes = await harness.request("/api/v1/orders", {
      method: "POST",
      headers: {
        ...harness.managerAuthHeader,
        "content-type": "application/json",
        "x-tenant-id": "1",
        "x-hub-id": "1",
      },
      body: JSON.stringify({
        customerId: customer.id,
        lines: [
          {
            serviceId: washFoldId,
            pricingBasis: "per_kg",
            weightGrams: 2000,
          },
        ],
      }),
    });
    expect(orderRes.status).toBe(201);
    const { data: createdOrder } = (await orderRes.json()) as {
      data: { order: { id: number; tenantId: number; branchId: number } };
    };
    const orderId = createdOrder.order.id;
    expect(createdOrder.order.tenantId).toBe(1);
    expect(createdOrder.order.branchId).toBe(1);

    // 3. GET /orders/:id with matching x-tenant-id and x-hub-id -> 200 OK
    const getSuccess = await harness.request(`/api/v1/orders/${orderId}`, {
      headers: {
        ...harness.managerAuthHeader,
        "x-tenant-id": "1",
        "x-hub-id": "1",
      },
    });
    expect(getSuccess.status).toBe(200);
    const successData = (await getSuccess.json()) as { data: { order: { id: number } } };
    expect(successData.data.order.id).toBe(orderId);

    // 4. GET /orders/:id with cross-hub header (x-hub-id: 2) -> 404 Not Found (isolated!)
    const getCrossHub = await harness.request(`/api/v1/orders/${orderId}`, {
      headers: {
        ...harness.managerAuthHeader,
        "x-tenant-id": "1",
        "x-hub-id": "2",
      },
    });
    expect(getCrossHub.status).toBe(404);

    // 5. GET /orders/:id with cross-tenant header (x-tenant-id: 2) -> 403 Forbidden
    const getCrossTenant = await harness.request(`/api/v1/orders/${orderId}`, {
      headers: {
        ...harness.managerAuthHeader,
        "x-tenant-id": "2",
        "x-hub-id": "1",
      },
    });
    expect(getCrossTenant.status).toBe(403);

    // 6. Header validation: invalid non-numeric headers throw 400 ValidationError
    const getInvalidTenant = await harness.request(`/api/v1/orders/${orderId}`, {
      headers: {
        ...harness.managerAuthHeader,
        "x-tenant-id": "invalid-tenant",
      },
    });
    expect(getInvalidTenant.status).toBe(400);

    const getInvalidHub = await harness.request(`/api/v1/orders/${orderId}`, {
      headers: {
        ...harness.managerAuthHeader,
        "x-hub-id": "-99",
      },
    });
    expect(getInvalidHub.status).toBe(400);

    // 7. GET /orders/:id/calendar-event with cross-hub header -> 404 Not Found
    const getCalCrossHub = await harness.request(
      `/api/v1/orders/${orderId}/calendar-event`,
      {
        headers: {
          ...harness.managerAuthHeader,
          "x-tenant-id": "1",
          "x-hub-id": "2",
        },
      },
    );
    expect(getCalCrossHub.status).toBe(404);

    // 8. PATCH /orders/:id/status with cross-hub header -> 404 Not Found
    const patchCrossHub = await harness.request(
      `/api/v1/orders/${orderId}/status`,
      {
        method: "PATCH",
        headers: {
          ...harness.managerAuthHeader,
          "content-type": "application/json",
          "x-tenant-id": "1",
          "x-hub-id": "2",
        },
        body: JSON.stringify({
          toStatus: "processing",
        }),
      },
    );
    expect(patchCrossHub.status).toBe(404);

    // 9. POST /orders/:id/notes with cross-hub header -> 404 Not Found
    const noteCrossHub = await harness.request(
      `/api/v1/orders/${orderId}/notes`,
      {
        method: "POST",
        headers: {
          ...harness.managerAuthHeader,
          "content-type": "application/json",
          "x-tenant-id": "1",
          "x-hub-id": "2",
        },
        body: JSON.stringify({
          note: "Unauthorized note",
        }),
      },
    );
    expect(noteCrossHub.status).toBe(404);

    // 10. POST /orders/:id/adjustments with cross-hub header -> 404 Not Found
    const adjCrossHub = await harness.request(
      `/api/v1/orders/${orderId}/adjustments`,
      {
        method: "POST",
        headers: {
          ...harness.managerAuthHeader,
          "content-type": "application/json",
          "x-tenant-id": "1",
          "x-hub-id": "2",
        },
        body: JSON.stringify({
          adjustmentType: "discount",
          description: "Unauthorized discount",
          amountPaise: -500,
        }),
      },
    );
    expect(adjCrossHub.status).toBe(404);

    // 11. GET /orders list with x-hub-id: 2 -> returns 0 orders for Hub 2
    const listHub2 = await harness.request(`/api/v1/orders`, {
      headers: {
        ...harness.managerAuthHeader,
        "x-tenant-id": "1",
        "x-hub-id": "2",
      },
    });
    expect(listHub2.status).toBe(200);
    const { data: hub2Page } = (await listHub2.json()) as { data: { items: any[] } };
    expect(hub2Page.items.length).toBe(0);

    // 12. GET /orders list with query parameter conflicting with x-hub-id header -> 403 Forbidden
    const listConflict = await harness.request(`/api/v1/orders?hubId=2`, {
      headers: {
        ...harness.managerAuthHeader,
        "x-tenant-id": "1",
        "x-hub-id": "1",
      },
    });
    expect(listConflict.status).toBe(403);
  });
});
