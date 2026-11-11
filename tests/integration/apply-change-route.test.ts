import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import type { InternalContext } from "../../packages/contracts/src/auth";
import type { SignedContext } from "../../packages/contracts/src/http";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../packages/contracts/src/http";
import { applyChangeResultSchema } from "../../packages/contracts/src/mutations";
import { signInternalContext } from "../../packages/shared/src/internal-context";
import laundry from "../../workers/laundry/src/index";
import {
  clearLaundryData,
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
const SECRET = "test-internal-context-secret-32-bytes";

async function seedSlot(): Promise<void> {
  await db
    .prepare(
      "INSERT INTO delivery_slots (id, hub_id, slot_key, local_date, local_start, starts_at, ends_at, capacity, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("slot-1", TEST_HUB, "2099-01-01-10", "2099-01-01", "10:00", Date.parse("2099-01-01T04:30:00.000Z"), Date.parse("2099-01-01T05:30:00.000Z"), 2, 1, 1)
    .run();
}

async function post(body: unknown): Promise<Response> {
  const now = Date.now();
  const context: InternalContext = {
    actorId: "manager-1",
    actorType: "user",
    role: "manager",
    tenantId: TEST_TENANT,
    hubId: TEST_HUB,
    exp: now + 60_000,
  };
  const signed = await signInternalContext({
    context: {
      ...context,
      iat: now,
      nonce: crypto.randomUUID(),
    } satisfies SignedContext,
    secret: SECRET,
  });

  const request = new Request("https://laundry.internal/api/orders/apply-change", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [INTERNAL_CONTEXT_HEADER]: signed.encoded,
      [INTERNAL_SIGNATURE_HEADER]: signed.signature,
      [INTERNAL_KEY_ID_HEADER]: signed.keyId,
    },
    body: JSON.stringify(body),
  });
  const ctx = createExecutionContext();
  const response = await laundry.fetch(
    request,
    {
      LAUNDRY_DB: db,
      INTERNAL_CONTEXT_SECRET: SECRET,
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
  await seedSlot();
});

it("applies a valid mutation through the HTTP route", async () => {
  const response = await post({
    orderId: "order-route",
    intent: "createOrder",
    payload: {
      customerId: "cust-1",
      serviceType: "wash_fold",
      deliverySlotId: "slot-1",
      items: [{ description: "Shirt", quantity: 1 }],
    },
    baseVersion: null,
    mutationId: "mutation-route",
  });

  expect(response.status).toBe(200);
  const body = applyChangeResultSchema.parse(await response.json());
  expect(body.replayed).toBe(false);
  expect(body.order.id).toBe("order-route");
  expect(body.order.status).toBe("confirmed");
  expect(body.order.version).toBe(1);
});

it("returns 409 with the current order on a stale base version", async () => {
  const response = await post({
    orderId: "order-1",
    intent: "markProcessing",
    payload: {},
    baseVersion: 0,
    mutationId: "mutation-route-stale",
  });

  expect(response.status).toBe(409);
  const body = (await response.json()) as {
    error: string;
    order: { version: number };
  };
  expect(body.error).toBe("VERSION_CONFLICT");
  expect(body.order.version).toBe(1);
});

it("rejects arbitrary status patches at the route boundary", async () => {
  const response = await post({
    orderId: "order-1",
    intent: "setStatus",
    payload: { status: "delivered" },
    baseVersion: 1,
    mutationId: "mutation-route-invalid",
  });

  expect(response.status).toBe(400);
});

it("rejects a blank hold comment at the route boundary", async () => {
  const response = await post({
    orderId: "order-1",
    intent: "placeOnHold",
    payload: { comments: "   " },
    baseVersion: 1,
    mutationId: "mutation-route-blank-hold",
  });

  expect(response.status).toBe(400);
});
