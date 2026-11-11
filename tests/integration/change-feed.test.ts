import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { InternalContext } from "../../packages/contracts/src/auth";
import {
  changeFeedResponseSchema,
  orderEventsResponseSchema,
} from "../../packages/contracts/src/changes";
import type { SignedContext } from "../../packages/contracts/src/http";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../packages/contracts/src/http";
import { signInternalContext } from "../../packages/shared/src/internal-context";
import laundry from "../../workers/laundry/src/index";
import { applyChange } from "../../workers/laundry/src/orders/apply-change";
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
const NOW = Date.parse("2026-11-11T04:00:00.000Z");
const SLOT_START = Date.parse("2026-11-11T04:30:00.000Z");
const SLOT_END = Date.parse("2026-11-11T05:30:00.000Z");

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

async function seedChanges(): Promise<void> {
  const rows = [
    [TEST_HUB, "order-1", 1, "upsert", 1000],
    [TEST_HUB, "order-2", 2, "upsert", 2000],
    [OTHER_HUB, "order-3", 1, "upsert", 1500],
    [TEST_HUB, "order-2", 3, "delete", 3000],
  ] as const;

  for (const row of rows) {
    await db
      .prepare(
        "INSERT INTO changes (hub_id, order_id, version, op, changed_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(...row)
      .run();
  }
}

async function seedEvent(): Promise<void> {
  await db
    .prepare(
      `INSERT INTO order_events (
        id, hub_id, order_id, mutation_id, payload_hash, event_type,
        source, actor_type, actor_id, previous_version, new_version, at, detail_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      "event-1",
      TEST_HUB,
      "order-1",
      "mutation-seed",
      "hash-seed",
      "createOrder",
      "app",
      "user",
      "user-desk",
      0,
      1,
      1500,
      JSON.stringify({ intent: "createOrder", newStatus: "confirmed" }),
    )
    .run();
}

async function countRows(
  table: string,
  orderId: string,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE order_id = ?`)
    .bind(orderId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
});

describe("change feed", () => {
  it("returns hub-scoped changes in ascending sequence order", async () => {
    await seedChanges();

    const response = await requestLaundry("/api/changes?since=0&limit=10");
    expect(response.status).toBe(200);

    const body = changeFeedResponseSchema.parse(await response.json());
    expect(body.changes.map((change) => change.orderId)).toEqual([
      "order-1",
      "order-2",
      "order-2",
    ]);
    expect(body.changes.map((change) => change.sequence)).toEqual(
      [...body.changes.map((change) => change.sequence)].sort((a, b) => a - b),
    );
    expect(body.changes.every((change) => change.hubId === TEST_HUB)).toBe(true);
    expect(body.changes[0]?.order?.customer.name).toBe("Alice");
    expect(body.changes[2]).toMatchObject({
      operation: "delete",
      order: null,
    });
  });

  it("paginates stably with an opaque sequence cursor", async () => {
    await seedChanges();

    const first = await requestLaundry("/api/changes?since=0&limit=2");
    const firstBody = changeFeedResponseSchema.parse(await first.json());
    expect(firstBody.changes).toHaveLength(2);
    expect(firstBody.hasMore).toBe(true);
    expect(firstBody.nextCursor).toBe(
      firstBody.changes[firstBody.changes.length - 1]?.sequence,
    );

    const second = await requestLaundry(
      `/api/changes?since=${firstBody.nextCursor}&limit=2`,
    );
    const secondBody = changeFeedResponseSchema.parse(await second.json());
    expect(secondBody.changes).toHaveLength(1);
    expect(secondBody.changes[0]).toMatchObject({
      orderId: "order-2",
      operation: "delete",
      order: null,
    });
    expect(secondBody.hasMore).toBe(false);
    expect(secondBody.nextCursor).toBe(secondBody.changes[0]?.sequence);

    const repeat = await requestLaundry("/api/changes?since=0&limit=2");
    const repeatBody = changeFeedResponseSchema.parse(await repeat.json());
    expect(repeatBody.changes.map((change) => change.sequence)).toEqual(
      firstBody.changes.map((change) => change.sequence),
    );
  });

  it("never returns another hub's changes", async () => {
    await seedChanges();

    const response = await requestLaundry("/api/changes?since=0&limit=10", {
      hubId: OTHER_HUB,
    });
    const body = changeFeedResponseSchema.parse(await response.json());

    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({
      orderId: "order-3",
      hubId: OTHER_HUB,
    });
  });

  it("records one event and one change for an accepted mutation", async () => {
    await db
      .prepare(
        "INSERT INTO delivery_slots (id, hub_id, slot_key, local_date, local_start, starts_at, ends_at, capacity, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        "slot-1",
        TEST_HUB,
        "2026-11-11-10",
        "2026-11-11",
        "10:00",
        SLOT_START,
        SLOT_END,
        2,
        1,
        NOW,
      )
      .run();

    const manager: InternalContext = {
      actorId: "manager-1",
      actorType: "user",
      role: "manager",
      tenantId: TEST_TENANT,
      hubId: TEST_HUB,
      exp: NOW + 60_000,
    };

    await applyChange(
      db,
      manager,
      {
        orderId: "order-new",
        intent: "createOrder",
        payload: {
          customerId: "cust-1",
          serviceType: "wash_fold",
          deliverySlotId: "slot-1",
          items: [{ description: "Shirt", quantity: 1 }],
        },
        baseVersion: null,
        mutationId: "mutation-new",
      },
      { now: NOW },
    );

    expect(await countRows("order_events", "order-new")).toBe(1);
    expect(await countRows("changes", "order-new")).toBe(1);

    const response = await requestLaundry("/api/changes?since=0&limit=10");
    const body = changeFeedResponseSchema.parse(await response.json());
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({
      orderId: "order-new",
      operation: "upsert",
      version: 1,
    });
  });
});

describe("order audit events", () => {
  it("returns event history for an order in the trusted hub", async () => {
    await seedEvent();

    const response = await requestLaundry("/api/orders/order-1/events");
    expect(response.status).toBe(200);

    const body = orderEventsResponseSchema.parse(await response.json());
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      mutationId: "mutation-seed",
      eventType: "createOrder",
      source: "app",
      actorId: "user-desk",
      previousVersion: 0,
      newVersion: 1,
    });
    expect(body.items[0]?.detail).toEqual({
      intent: "createOrder",
      newStatus: "confirmed",
    });
  });

  it("rejects cross-hub event reads and service-role access", async () => {
    await seedEvent();

    const crossHub = await requestLaundry("/api/orders/order-3/events");
    expect(crossHub.status).toBe(404);

    const service = await requestLaundry("/api/orders/order-1/events", {
      role: "service",
      actorType: "service",
      actorId: "service:scheduler",
    });
    expect(service.status).toBe(403);
  });
});
