import { describe, expect, it } from "vitest";
import { computeHmacSha256Hex } from "../../workers/api/src/infrastructure/payments/payment-provider.adapter";
import { createAppContainer } from "../../workers/api/src/presentation/container";
import { createTestHarness } from "../helpers/test-app";

describe("Laundry Management Backend — Full End-to-End Integration (D1 + R2)", () => {
  it("serves /health, /health/database, and enforces fail-closed Supabase Auth on /api/me", async () => {
    const harness = await createTestHarness();

    const health = await harness.request("/health");
    expect(health.status).toBe(200);
    expect(health.headers.get("x-request-id")).toBeTruthy();

    const dbHealth = await harness.request("/health/database");
    expect(dbHealth.status).toBe(200);
    const dbBody = (await dbHealth.json()) as {
      status: string;
      foreignKeysEnabled: boolean;
    };
    expect(dbBody.status).toBe("ok");
    expect(dbBody.foreignKeysEnabled).toBe(true);

    // OPTIONS preflight -> 204 No Content with CORS headers
    const preflight = await harness.request("/api/me", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization, content-type, x-request-id",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("GET");
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");

    // OPTIONS preflight for order creation with idempotency-key and custom gateway headers
    const orderPreflight = await harness.request("/api/v1/orders", {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:3000",
        "access-control-request-method": "POST",
        "access-control-request-headers":
          "authorization, content-type, idempotency-key, x-hub-id, x-rc-version, x-request-id, x-tenant-id",
      },
    });
    expect(orderPreflight.status).toBe(204);
    expect(orderPreflight.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3000");
    expect(orderPreflight.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("idempotency-key");
    expect(orderPreflight.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("x-tenant-id");

    // Missing token -> 401
    const unauth = await harness.request("/api/me");
    expect(unauth.status).toBe(401);

    // Valid Supabase JWT without D1 staff membership -> 403 fail-closed
    const forbidden = await harness.request("/api/me", {
      headers: { authorization: "Bearer unassigned-user-token" },
    });
    expect(forbidden.status).toBe(403);

    // Assigned manager -> 200 with session context
    const me = await harness.request("/api/me", {
      headers: harness.managerAuthHeader,
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as {
      user: { displayName: string };
      role: string;
      hub: { id: string };
    };
    expect(meBody.user.displayName).toBe("Priya Manager");
    expect(meBody.role).toBe("manager");
    expect(meBody.hub.id).toBe("MAIN");

    // Versioned alias /api/v1/me also serves session context
    const meV1 = await harness.request("/api/v1/me", {
      headers: harness.managerAuthHeader,
    });
    expect(meV1.status).toBe(200);
  });

  it("supports customer CRUD, addresses, preferences, duplicate code rejection, and cursor pagination", async () => {
    const harness = await createTestHarness();

    for (let i = 1; i <= 3; i += 1) {
      const res = await harness.request("/api/v1/customers", {
        method: "POST",
        headers: { ...harness.managerAuthHeader, "content-type": "application/json" },
        body: JSON.stringify({
          customerCode: `CUST-00${i}`,
          fullName: `Customer ${i}`,
          phone: `+91987654320${i}`,
        }),
      });
      expect(res.status).toBe(201);
    }

    // Duplicate business identifier rejected with 409
    const dup = await harness.request("/api/v1/customers", {
      method: "POST",
      headers: { ...harness.managerAuthHeader, "content-type": "application/json" },
      body: JSON.stringify({
        customerCode: "CUST-001",
        fullName: "Duplicate",
        phone: "+919876543299",
      }),
    });
    expect(dup.status).toBe(409);

    // Cursor pagination with limit=2 traverses all 3 cleanly without duplicates
    const p1Res = await harness.request("/api/v1/customers?limit=2", {
      headers: harness.managerAuthHeader,
    });
    const p1 = (await p1Res.json()) as {
      data: { items: Array<{ id: number }>; nextCursor: string | null; hasMore: boolean };
    };
    expect(p1.data.items).toHaveLength(2);
    expect(p1.data.hasMore).toBe(true);
    expect(p1.data.nextCursor).toBeTruthy();

    const p2Res = await harness.request(
      `/api/v1/customers?limit=2&cursor=${encodeURIComponent(p1.data.nextCursor!)}`,
      { headers: harness.managerAuthHeader },
    );
    const p2 = (await p2Res.json()) as {
      data: { items: Array<{ id: number }>; hasMore: boolean };
    };
    expect(p2.data.items).toHaveLength(1);
    expect(p2.data.hasMore).toBe(false);
    expect(p1.data.items.map((x) => x.id)).not.toContain(p2.data.items[0]!.id);
  });

  it("uploads and downloads catalog item images via Cloudflare R2 with object keys stored in D1", async () => {
    const harness = await createTestHarness();
    const shirtId = harness.seed.itemIds["SHIRT"]!;
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

    const uploadRes = await harness.request(`/api/v1/items/${shirtId}/image`, {
      method: "PUT",
      headers: { ...harness.managerAuthHeader, "content-type": "image/png" },
      body: pngBytes,
    });
    expect(uploadRes.status).toBe(200);
    const { data: updatedItem } = (await uploadRes.json()) as {
      data: { imageR2Key: string; imageSizeBytes: number; imageContentType: string };
    };
    expect(updatedItem.imageR2Key).toMatch(/^items\/\d+\/\d+\.png$/);
    expect(updatedItem.imageSizeBytes).toBe(pngBytes.byteLength);
    expect(updatedItem.imageContentType).toBe("image/png");

    const downloadRes = await harness.request(`/api/v1/items/${shirtId}/image`, {
      headers: harness.managerAuthHeader,
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe("image/png");
    const downloaded = new Uint8Array(await downloadRes.arrayBuffer());
    expect(Array.from(downloaded)).toEqual(Array.from(pngBytes));
  });

  it("handles mixed per-item & per-kg orders, GST snapshots, idempotency, partial billing, webhooks, allocations, refunds, immutability, and deliveries", async () => {
    const harness = await createTestHarness();
    const jsonHeaders = {
      ...harness.managerAuthHeader,
      "content-type": "application/json",
    };

    // 1. Create inter-state customer (stateCode '27' Maharashtra vs branch '29' Karnataka -> IGST)
    const custRes = await harness.request("/api/v1/customers", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        customerCode: "CUST-IGST-01",
        fullName: "Meera Nair",
        phone: "+919911223344",
        stateCode: "27",
      }),
    });
    const { data: customer } = (await custRes.json()) as { data: { id: number } };

    const addrRes = await harness.request(`/api/v1/customers/${customer.id}/addresses`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        addressType: "delivery",
        line1: "402 Marine Drive",
        city: "Mumbai",
        state: "Maharashtra",
        stateCode: "27",
        postalCode: "400001",
      }),
    });
    const { data: address } = (await addrRes.json()) as { data: { id: number } };

    // 2. Create mixed order (per_item Shirt x2 + per_kg Wash & Fold 1500g) with Idempotency-Key
    const orderPayload = {
      customerId: customer.id,
      deliveryAddressId: address.id,
      lines: [
        {
          serviceId: harness.seed.serviceIds["WASH_IRON"],
          itemId: harness.seed.itemIds["SHIRT"],
          pricingBasis: "per_item",
          quantityPieces: 2,
          discountPaise: 1000, // ₹10 discount before GST
        },
        {
          serviceId: harness.seed.serviceIds["WASH_FOLD"],
          pricingBasis: "per_kg",
          weightGrams: 1500, // 1.5 kg * ₹99/kg = 14850 paise
          discountPaise: 0,
        },
      ],
    };

    const ord1 = await harness.request("/api/v1/orders", {
      method: "POST",
      headers: { ...jsonHeaders, "idempotency-key": "ord-idem-key-1" },
      body: JSON.stringify(orderPayload),
    });
    expect(ord1.status).toBe(201);
    const { data: createdOrder } = (await ord1.json()) as {
      data: {
        order: {
          id: number;
          taxSupplyType: string;
          subtotalPaise: number;
          discountPaise: number;
          taxableAmountPaise: number;
          igstPaise: number;
          cgstPaise: number;
          sgstPaise: number;
          totalAmountPaise: number;
        };
        items: Array<{ id: number; lineTotalPaise: number }>;
        statusHistory: Array<{ toStatus: string }>;
      };
    };

    // Shirt: 2*6000 = 12000 - 1000 = 11000 taxable -> 18% IGST = 1980 -> 12980
    // Wash&Fold: 1500g * 9900 / 1000 = 14850 taxable -> 18% IGST = 2673 -> 17523
    expect(createdOrder.order.taxSupplyType).toBe("inter_state");
    expect(createdOrder.order.subtotalPaise).toBe(26850);
    expect(createdOrder.order.discountPaise).toBe(1000);
    expect(createdOrder.order.taxableAmountPaise).toBe(25850);
    expect(createdOrder.order.igstPaise).toBe(4653);
    expect(createdOrder.order.cgstPaise).toBe(0);
    expect(createdOrder.order.sgstPaise).toBe(0);
    expect(createdOrder.order.totalAmountPaise).toBe(30503);
    expect(createdOrder.statusHistory).toHaveLength(1);

    // Same idempotency key + same payload -> replayed cleanly
    const ordReplay = await harness.request("/api/v1/orders", {
      method: "POST",
      headers: { ...jsonHeaders, "idempotency-key": "ord-idem-key-1" },
      body: JSON.stringify(orderPayload),
    });
    expect(ordReplay.status).toBe(201);
    expect(ordReplay.headers.get("x-idempotent-replayed")).toBe("true");
    const replayJson = (await ordReplay.json()) as { data: { order: { id: number } } };
    expect(replayJson.data.order.id).toBe(createdOrder.order.id);

    // Same idempotency key + different payload -> 409 conflict
    const ordConflict = await harness.request("/api/v1/orders", {
      method: "POST",
      headers: { ...jsonHeaders, "idempotency-key": "ord-idem-key-1" },
      body: JSON.stringify({
        ...orderPayload,
        specialInstructions: "Changed body",
      }),
    });
    expect(ordConflict.status).toBe(409);

    // 3. Prove later rate-card price change does NOT alter historical order snapshot
    await harness.env.DB.prepare(
      "UPDATE rate_card_items SET unit_price_paise = 99999 WHERE rate_card_id = ?",
    )
      .bind(harness.seed.defaultRateCardId)
      .run();

    const refetchedOrd = await harness.request(
      `/api/v1/orders/${createdOrder.order.id}`,
      { headers: harness.managerAuthHeader },
    );
    const refetchedBody = (await refetchedOrd.json()) as {
      data: { order: { totalAmountPaise: number } };
    };
    expect(refetchedBody.data.order.totalAmountPaise).toBe(30503);

    // 4. Issue invoice for order + verify DB immutability trigger on issued invoice
    const invRes = await harness.request(
      `/api/v1/orders/${createdOrder.order.id}/invoices`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ issueImmediately: true }),
      },
    );
    expect(invRes.status).toBe(201);
    const { data: invData } = (await invRes.json()) as {
      data: {
        invoice: { id: number; status: string; totalAmountPaise: number; balanceDuePaise: number };
        items: Array<{ orderItemId: number }>;
      };
    };
    expect(invData.invoice.status).toBe("issued");
    expect(invData.invoice.totalAmountPaise).toBe(30503);
    expect(invData.items[0]!.orderItemId).toBe(createdOrder.items[0]!.id);

    // Attempting to tamper with issued invoice monetary total is rejected by DB trigger
    await expect(
      harness.env.DB.prepare("UPDATE invoices SET total_amount_paise = 1 WHERE id = ?")
        .bind(invData.invoice.id)
        .run(),
    ).rejects.toThrow(/immutable/i);

    // 5. Initiate online gateway payment (must stay pending until webhook confirms!)
    const payInitRes = await harness.request("/api/v1/payments", {
      method: "POST",
      headers: { ...jsonHeaders, "idempotency-key": "pay-idem-1" },
      body: JSON.stringify({
        customerId: customer.id,
        orderId: createdOrder.order.id,
        paymentMethod: "online_gateway",
        amountPaise: 20000, // Partial payment of ₹200.00
        provider: "razorpay",
        providerReference: "rzp_pay_001",
      }),
    });
    expect(payInitRes.status).toBe(201);
    const { data: payData } = (await payInitRes.json()) as {
      data: { payment: { id: number; status: string; capturedAmountPaise: number } };
    };
    expect(payData.payment.status).toBe("pending");
    expect(payData.payment.capturedAmountPaise).toBe(0);

    // Pending payment cannot be allocated yet
    const prematureAlloc = await harness.request(
      `/api/v1/payments/${payData.payment.id}/allocations`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ invoiceId: invData.invoice.id, amountPaise: 20000 }),
      },
    );
    expect(prematureAlloc.status).toBe(422);

    // 6. Signature-verified webhook confirms payment capture (+ duplicate event idempotency)
    const webhookBody = JSON.stringify({
      provider: "razorpay",
      providerReference: "rzp_pay_001",
      providerEventId: "evt_001",
      eventType: "payment.captured",
      amountPaise: 20000,
    });
    const badSigRes = await harness.request("/api/v1/webhooks/payments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-signature": "deadbeef",
      },
      body: webhookBody,
    });
    expect(badSigRes.status).toBe(401);

    const validSig = await computeHmacSha256Hex(
      webhookBody,
      harness.env.PAYMENT_WEBHOOK_SECRET!,
    );
    const wh1 = await harness.request("/api/v1/webhooks/payments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-signature": validSig,
      },
      body: webhookBody,
    });
    expect(wh1.status).toBe(200);
    const wh1Body = (await wh1.json()) as {
      data: { payment: { status: string }; duplicateEvent: boolean };
    };
    expect(wh1Body.data.payment.status).toBe("captured");
    expect(wh1Body.data.duplicateEvent).toBe(false);

    // Duplicate webhook event is safely detected & ignored
    const whDup = await harness.request("/api/v1/webhooks/payments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment-signature": validSig,
      },
      body: webhookBody,
    });
    expect(whDup.status).toBe(200);
    const whDupBody = (await whDup.json()) as { data: { duplicateEvent: boolean } };
    expect(whDupBody.data.duplicateEvent).toBe(true);

    // 7. Allocate captured partial payment (₹200.00) to invoice (₹305.03) -> partially_paid
    const allocRes = await harness.request(
      `/api/v1/payments/${payData.payment.id}/allocations`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ invoiceId: invData.invoice.id, amountPaise: 20000 }),
      },
    );
    expect(allocRes.status).toBe(201);
    const { data: allocData } = (await allocRes.json()) as {
      data: { invoice: { status: string; paidAmountPaise: number; balanceDuePaise: number } };
    };
    expect(allocData.invoice.status).toBe("partially_paid");
    expect(allocData.invoice.paidAmountPaise).toBe(20000);
    expect(allocData.invoice.balanceDuePaise).toBe(10503);

    // Over-allocating beyond payment capacity fails cleanly
    const overAlloc = await harness.request(
      `/api/v1/payments/${payData.payment.id}/allocations`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ invoiceId: invData.invoice.id, amountPaise: 1 }),
      },
    );
    expect(overAlloc.status).toBe(422);

    // 8. Partial refund updates payment status to partially_refunded
    const refundRes = await harness.request(
      `/api/v1/payments/${payData.payment.id}/refunds`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          invoiceId: invData.invoice.id,
          amountPaise: 5000,
          reason: "Garment damage adjustment",
        }),
      },
    );
    expect(refundRes.status).toBe(201);
    const { data: refundData } = (await refundRes.json()) as {
      data: { payment: { status: string; refundedAmountPaise: number } };
    };
    expect(refundData.payment.status).toBe("partially_refunded");
    expect(refundData.payment.refundedAmountPaise).toBe(5000);

    // 9. Delivery scheduling + immutable address snapshot + status transition history
    const delivRes = await harness.request(
      `/api/v1/orders/${createdOrder.order.id}/deliveries`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          deliveryType: "delivery",
          customerAddressId: address.id,
          scheduledAt: "2026-06-17T10:00:00.000Z",
        }),
      },
    );
    expect(delivRes.status).toBe(201);
    const { data: delivData } = (await delivRes.json()) as {
      data: { delivery: { id: number; addressSnapshotJson: string } };
    };
    expect(delivData.delivery.addressSnapshotJson).toContain("402 Marine Drive");

    const delivPatch = await harness.request(
      `/api/v1/deliveries/${delivData.delivery.id}/status`,
      {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ toStatus: "dispatched", reason: "Out with rider" }),
      },
    );
    expect(delivPatch.status).toBe(200);

    const delivDetail = await harness.request(
      `/api/v1/deliveries/${delivData.delivery.id}`,
      { headers: harness.managerAuthHeader },
    );
    const delivDetailBody = (await delivDetail.json()) as {
      data: { delivery: { status: string }; history: Array<{ toStatus: string }> };
    };
    expect(delivDetailBody.data.delivery.status).toBe("dispatched");
    expect(delivDetailBody.data.history.map((h) => h.toStatus)).toEqual([
      "scheduled",
      "dispatched",
    ]);

    // 10. Storage health monitoring & verified R2 archive manifest + checksum read-back
    const storageRes = await harness.request("/api/v1/system/storage-health", {
      headers: harness.managerAuthHeader,
    });
    expect(storageRes.status).toBe(200);
    const { data: storageReport } = (await storageRes.json()) as {
      data: { usedBytes: number; alertLevel: string; metrics: { tableCounts: Record<string, number> } };
    };
    expect(storageReport.usedBytes).toBeGreaterThan(0);
    expect(storageReport.alertLevel).toBe("normal");
    expect(storageReport.metrics.tableCounts["orders"]).toBe(1);

    const container = createAppContainer(harness.env);
    const archive = await container.healthUseCases.createVerifiedArchiveBatch({
      entityType: "orders",
      records: [createdOrder.order],
    });
    expect(archive.verified).toBe(true);
    expect(archive.manifest.recordCount).toBe(1);
    expect(archive.manifest.dataSha256Hex).toHaveLength(64);
  });
});
