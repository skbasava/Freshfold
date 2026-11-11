import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  customerListResponseSchema,
  orderDetailSchema,
  orderListResponseSchema,
} from "../../packages/contracts/src/orders";
import type { SignedContext } from "../../packages/contracts/src/http";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../packages/contracts/src/http";
import { signInternalContext } from "../../packages/shared/src/internal-context";
import laundry from "../../workers/laundry/src/index";
import {
  clearLaundryData,
  OTHER_HUB,
  seedLaundryReadFixtures,
  TEST_HUB,
  TEST_TENANT,
} from "../helpers/laundry-db";

type LaundryTestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as LaundryTestEnv;
const db = testEnv.LAUNDRY_DB;
const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";

function signedContext(
  overrides: Partial<SignedContext> = {},
): SignedContext {
  const now = Date.now();
  return {
    actorId: "user-desk",
    actorType: "user",
    role: "front_desk",
    tenantId: TEST_TENANT,
    hubId: TEST_HUB,
    iat: now,
    exp: now + 60_000,
    nonce: crypto.randomUUID(),
    ...overrides,
  };
}

async function requestLaundry(
  path: string,
  overrides: Partial<SignedContext> = {},
): Promise<Response> {
  const signed = await signInternalContext({
    context: signedContext(overrides),
    secret: INTERNAL_CONTEXT_SECRET,
  });
  const request = new Request(`https://laundry.internal${path}`, {
    headers: {
      [INTERNAL_CONTEXT_HEADER]: signed.encoded,
      [INTERNAL_SIGNATURE_HEADER]: signed.signature,
      [INTERNAL_KEY_ID_HEADER]: signed.keyId,
    },
  });
  const ctx = createExecutionContext();
  const response = await laundry.fetch(
    request,
    {
      LAUNDRY_DB: db,
      INTERNAL_CONTEXT_SECRET,
      SERVICE_TOKEN: "test-service-token-32-characters-long",
    },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
});

describe("customer and order reads", () => {
  it("lists only customers in the trusted hub", async () => {
    const response = await requestLaundry("/api/customers");
    expect(response.status).toBe(200);

    const body = customerListResponseSchema.parse(await response.json());
    expect(body.items.map((item) => item.id)).toEqual(["cust-2", "cust-1"]);
    expect(body.nextCursor).toBeNull();
    expect(body.items.every((item) => item.hubId === TEST_HUB)).toBe(true);
  });

  it("paginates customers deterministically with an opaque cursor", async () => {
    const first = await requestLaundry("/api/customers?limit=1");
    expect(first.status).toBe(200);
    const firstBody = customerListResponseSchema.parse(await first.json());
    expect(firstBody.items.map((item) => item.id)).toEqual(["cust-2"]);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await requestLaundry(
      `/api/customers?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`,
    );
    expect(second.status).toBe(200);
    const secondBody = customerListResponseSchema.parse(await second.json());
    expect(secondBody.items.map((item) => item.id)).toEqual(["cust-1"]);
    expect(secondBody.nextCursor).toBeNull();
  });

  it("returns 404 for unknown and cross-hub customer IDs", async () => {
    const otherHub = await requestLaundry("/api/customers/cust-3");
    const missing = await requestLaundry("/api/customers/cust-missing");

    expect(otherHub.status).toBe(404);
    expect(missing.status).toBe(404);
  });

  it("lists only orders in the trusted hub and ignores a client hub hint", async () => {
    const response = await requestLaundry(`/api/orders?hubId=${OTHER_HUB}`);
    expect(response.status).toBe(200);

    const body = orderListResponseSchema.parse(await response.json());
    expect(body.items.map((item) => item.id)).toEqual(["order-2", "order-1"]);
    expect(body.items.every((item) => item.hubId === TEST_HUB)).toBe(true);
    expect(body.items.map((item) => item.customerName)).toEqual(["Bob", "Alice"]);
  });

  it("paginates orders deterministically", async () => {
    const first = await requestLaundry("/api/orders?limit=1");
    const firstBody = orderListResponseSchema.parse(await first.json());
    expect(firstBody.items.map((item) => item.id)).toEqual(["order-2"]);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await requestLaundry(
      `/api/orders?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`,
    );
    const secondBody = orderListResponseSchema.parse(await second.json());
    expect(secondBody.items.map((item) => item.id)).toEqual(["order-1"]);
    expect(secondBody.nextCursor).toBeNull();
  });

  it("returns an order detail with hub-scoped customer and items", async () => {
    const response = await requestLaundry("/api/orders/order-1");
    expect(response.status).toBe(200);

    const body = orderDetailSchema.parse(await response.json());
    expect(body).toMatchObject({
      id: "order-1",
      hubId: TEST_HUB,
      customerId: "cust-1",
      customerName: "Alice",
      customer: { id: "cust-1", name: "Alice" },
      items: [{ id: "item-1", orderId: "order-1", description: "Shirt" }],
    });
  });

  it("returns 404 for unknown and cross-hub order IDs", async () => {
    const otherHub = await requestLaundry("/api/orders/order-3");
    const missing = await requestLaundry("/api/orders/order-missing");

    expect(otherHub.status).toBe(404);
    expect(missing.status).toBe(404);
  });

  it("rejects invalid pagination and cursor values", async () => {
    const tooLarge = await requestLaundry("/api/orders?limit=101");
    const badCursor = await requestLaundry("/api/customers?cursor=not-a-cursor");

    expect(tooLarge.status).toBe(400);
    expect(badCursor.status).toBe(400);
  });

  it("denies reads to a service actor without view_orders", async () => {
    const response = await requestLaundry("/api/orders", {
      actorId: "system:calendar",
      actorType: "system",
      role: "service",
    });

    expect(response.status).toBe(403);
  });

  it("requires a trusted actor", async () => {
    const request = new Request("https://laundry.internal/api/orders");
    const ctx = createExecutionContext();
    const response = await laundry.fetch(
      request,
      { LAUNDRY_DB: db, INTERNAL_CONTEXT_SECRET },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });
});
