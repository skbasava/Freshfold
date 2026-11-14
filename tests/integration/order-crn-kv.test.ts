import { describe, it, expect, beforeEach } from "vitest";
import { createTestD1Database } from "../helpers/d1-sqlite";
import laundry from "../../workers/laundry/src/index";
import { OrderStateService } from "../../workers/laundry/src/services/order-state.service";
import type { SignedContext } from "../../packages/contracts/src/http";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../packages/contracts/src/http";
import { signInternalContext } from "../../packages/shared/src/internal-context";
import { parseCrn } from "../../packages/contracts/src/crn";

const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";

function signedContext(overrides: Partial<SignedContext> = {}): SignedContext {
  const now = Date.now();
  return {
    actorId: "staff-user-01",
    actorType: "user",
    role: "manager",
    tenantId: "tenant-mum-01",
    hubId: "hub-bandra-01",
    iat: now,
    exp: now + 60_000,
    nonce: crypto.randomUUID(),
    ...overrides,
  };
}

function getFutureSlotTiming() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const dateStr = tomorrow.toISOString().slice(0, 10);
  // 10:00 AM IST is 04:30 AM UTC
  const startsAt = Date.parse(`${dateStr}T04:30:00.000Z`);
  const endsAt = Date.parse(`${dateStr}T05:30:00.000Z`);
  return { dateStr, startsAt, endsAt };
}

describe("Order CRN and Cloudflare KV State Management", () => {
  let db: D1Database;
  const now = Date.now();
  const slotTiming = getFutureSlotTiming();

  beforeEach(() => {
    OrderStateService.clearMemoryFallback();
    db = createTestD1Database();

    // Seed tenant and hub with sequence IDs for CRN 9-bit and 4-bit packing
    db.prepare(
      `INSERT OR REPLACE INTO tenants (id, name, slug, seq_id, created_at, updated_at)
       VALUES ('tenant-mum-01', 'Mumbai Laundry Hub', 'mum-laundry', 1, ?, ?)`
    ).bind(now, now).run();

    db.prepare(
      `INSERT OR REPLACE INTO hubs (id, tenant_id, name, code, seq_id, created_at, updated_at)
       VALUES ('hub-bandra-01', 'tenant-mum-01', 'Bandra Facility', 'BAND', 0, ?, ?)`
    ).bind(now, now).run();

    // Seed delivery slot
    db.prepare(
      `INSERT OR REPLACE INTO delivery_slots (
         id, hub_id, slot_key, local_date, local_start, starts_at, ends_at, capacity, active, created_at
       ) VALUES (
         'slot-bandra-01', 'hub-bandra-01', ?, ?, '10:00',
         ?, ?, 10, 1, ?
       )`
    ).bind(
      `${slotTiming.dateStr}#10:00`,
      slotTiming.dateStr,
      slotTiming.startsAt,
      slotTiming.endsAt,
      now,
    ).run();
  });

  async function requestLaundry(
    path: string,
    method = "GET",
    body?: unknown,
    overrides: Partial<SignedContext> = {},
  ): Promise<Response> {
    const signed = await signInternalContext({
      context: signedContext(overrides),
      secret: INTERNAL_CONTEXT_SECRET,
    });

    const headers: Record<string, string> = {
      [INTERNAL_CONTEXT_HEADER]: signed.encoded,
      [INTERNAL_SIGNATURE_HEADER]: signed.signature,
      [INTERNAL_KEY_ID_HEADER]: signed.keyId,
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const request = new Request(`https://laundry.internal${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    return laundry.fetch(
      request,
      {
        LAUNDRY_DB: db,
        INTERNAL_CONTEXT_SECRET,
        SERVICE_TOKEN: "test-service-token-32-characters-long",
      },
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as any,
    );
  }

  it("creates an order, assigns 32-bit compact CRN and initializes state in KV", async () => {
    const orderPayload = {
      customerName: "Aarav Sharma",
      customerPhone: "+919876543210",
      serviceType: "wash_fold",
      deliverySlotId: "slot-bandra-01",
      items: [
        { description: "Cotton Shirts", quantity: 3, serviceType: "wash_iron" },
        { description: "Trousers", quantity: 2, serviceType: "dry_clean" },
      ],
    };

    const res = await requestLaundry("/api/orders", "POST", orderPayload);
    expect(res.status).toBe(201);

    const order = (await res.json()) as any;
    expect(order.id).toBeDefined();
    expect(order.crnId).toBeDefined();
    expect(order.crnId).toMatch(/^crn:\d+:\d+:\d+$/);

    // Verify 9-bit tenant, 4-bit hub, 19-bit order unpacking
    const components = parseCrn(order.crnId);
    expect(components.tenantId).toBe(1);
    expect(components.hubId).toBe(0);
    expect(components.orderId).toBeGreaterThanOrEqual(1);

    // Verify KV state model via GET /api/orders/:id/state
    const stateRes = await requestLaundry(`/api/orders/${order.id}/state`, "GET");
    expect(stateRes.status).toBe(200);

    const state = (await stateRes.json()) as any;
    expect(state.crnId).toBe(order.crnId);
    expect(state.previousState).toBeNull();
    expect(state.currentState).toBe("confirmed");
    expect(state.intent).toBe("createOrder");
    expect(state.diagnostic.status).toBe("healthy");
  });

  it("transitions order state in KV while tracking previous and current state", async () => {
    // 1. Create order
    const createRes = await requestLaundry("/api/orders", "POST", {
      customerName: "Pooja Patel",
      customerPhone: "+919123456789",
      serviceType: "wash_fold",
      deliverySlotId: "slot-bandra-01",
      items: [{ description: "Bed Sheet", quantity: 1 }],
    });
    expect(createRes.status).toBe(201);
    const order = (await createRes.json()) as any;
    const crnId = order.crnId;

    // 2. Transition confirmed -> processing
    const transitionRes = await requestLaundry("/api/orders/apply-change", "POST", {
      intent: "markProcessing",
      orderId: order.id,
      mutationId: crypto.randomUUID(),
      payload: {},
      baseVersion: order.version,
    });
    expect(transitionRes.status).toBe(200);

    // 3. Inspect KV state
    const stateRes1 = await requestLaundry(`/api/orders/${crnId}/state`, "GET");
    expect(stateRes1.status).toBe(200);
    const state1 = (await stateRes1.json()) as any;
    expect(state1.previousState).toBe("confirmed");
    expect(state1.currentState).toBe("processing");
    expect(state1.intent).toBe("markProcessing");
    expect(state1.diagnostic.status).toBe("healthy");

    // 4. Transition processing -> hold with mandatory comment
    const holdRes = await requestLaundry("/api/orders/apply-change", "POST", {
      intent: "placeOnHold",
      orderId: order.id,
      mutationId: crypto.randomUUID(),
      payload: { comments: "Delicate silk embroidery requires customer confirmation" },
      baseVersion: state1.version,
    });
    expect(holdRes.status).toBe(200);

    // 5. Inspect KV state on hold
    const stateRes2 = await requestLaundry(`/api/orders/${order.id}/state`, "GET");
    const state2 = (await stateRes2.json()) as any;
    expect(state2.previousState).toBe("processing");
    expect(state2.currentState).toBe("hold");
    expect(state2.intent).toBe("placeOnHold");
    expect(state2.diagnostic.status).toBe("held");
    expect(state2.diagnostic.reason).toBe("Delicate silk embroidery requires customer confirmation");
  });

  it("records broken flow diagnostic in KV when an invalid transition is rejected", async () => {
    // 1. Create order
    const createRes = await requestLaundry("/api/orders", "POST", {
      customerName: "Rohan Mehta",
      customerPhone: "+919988776655",
      serviceType: "wash_fold",
      deliverySlotId: "slot-bandra-01",
      items: [{ description: "Suit", quantity: 1 }],
    });
    expect(createRes.status).toBe(201);
    const order = (await createRes.json()) as any;

    // 2. Attempt invalid transition: confirmed -> delivered (must go through processing and out_for_delivery)
    const invalidRes = await requestLaundry("/api/orders/apply-change", "POST", {
      intent: "markDelivered",
      orderId: order.id,
      mutationId: crypto.randomUUID(),
      payload: {},
      baseVersion: order.version,
    });
    expect(invalidRes.status).toBe(422);

    // 3. Inspect KV: diagnostic records broken flow details
    const stateRes = await requestLaundry(`/api/orders/${order.id}/state`, "GET");
    expect(stateRes.status).toBe(200);
    const state = (await stateRes.json()) as any;
    expect(state.diagnostic.status).toBe("broken");
    expect(state.diagnostic.brokenStep).toBe("markDelivered");
    expect(state.diagnostic.errorCode).toBe("INVALID_TRANSITION");
  });

  it("cancels an order, releases slot capacity, and records cancelled state in KV", async () => {
    const createRes = await requestLaundry("/api/orders", "POST", {
      customerName: "Ananya Roy",
      customerPhone: "+919811223344",
      serviceType: "wash_fold",
      deliverySlotId: "slot-bandra-01",
      items: [{ description: "Curtains", quantity: 2 }],
    });
    expect(createRes.status).toBe(201);
    const order = (await createRes.json()) as any;

    // Cancel order
    const cancelRes = await requestLaundry(`/api/orders/${order.id}`, "DELETE", {
      reason: "Customer cancelled prior to pickup",
    });
    expect(cancelRes.status).toBe(200);

    const cancelledOrder = (await cancelRes.json()) as any;
    expect(cancelledOrder.status).toBe("cancelled");

    // Inspect KV state
    const stateRes = await requestLaundry(`/api/orders/${order.id}/state`, "GET");
    const state = (await stateRes.json()) as any;
    expect(state.currentState).toBe("cancelled");
    expect(state.diagnostic.status).toBe("cancelled");
    expect(state.diagnostic.reason).toBe("Customer cancelled prior to pickup");
  });

  it("retrieves order details transparently using either UUID or CRN string", async () => {
    const createRes = await requestLaundry("/api/orders", "POST", {
      customerName: "Vikram Sengupta",
      customerPhone: "+919777888999",
      serviceType: "wash_fold",
      deliverySlotId: "slot-bandra-01",
      items: [{ description: "Jeans", quantity: 2 }],
    });
    expect(createRes.status).toBe(201);
    const order = (await createRes.json()) as any;
    const crnId = order.crnId;

    // Lookup by internal UUID
    const byUuidRes = await requestLaundry(`/api/orders/${order.id}`, "GET");
    expect(byUuidRes.status).toBe(200);
    const byUuid = (await byUuidRes.json()) as any;
    expect(byUuid.id).toBe(order.id);

    // Lookup by CRN string
    const byCrnRes = await requestLaundry(`/api/orders/${crnId}`, "GET");
    expect(byCrnRes.status).toBe(200);
    const byCrn = (await byCrnRes.json()) as any;
    expect(byCrn.id).toBe(order.id);
    expect(byCrn.crnId).toBe(crnId);
  });
});
