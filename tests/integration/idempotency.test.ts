import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { InternalContext } from "../../packages/contracts/src/auth";
import type { ApplyChangeInput } from "../../packages/contracts/src/mutations";
import {
  applyChange,
  ApplyChangeError,
} from "../../workers/laundry/src/orders/apply-change";
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
const NOW = Date.parse("2026-11-11T04:00:00.000Z");
const SLOT_1_START = Date.parse("2026-11-11T04:30:00.000Z");
const SLOT_1_END = Date.parse("2026-11-11T05:30:00.000Z");

const manager: InternalContext = {
  actorId: "manager-1",
  actorType: "user",
  role: "manager",
  tenantId: TEST_TENANT,
  hubId: TEST_HUB,
  exp: NOW + 60_000,
};

async function seedSlots(): Promise<void> {
  await db
    .prepare(
      "INSERT INTO delivery_slots (id, hub_id, slot_key, local_date, local_start, starts_at, ends_at, capacity, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("slot-1", TEST_HUB, "2026-11-11-10", "2026-11-11", "10:00", SLOT_1_START, SLOT_1_END, 2, 1, 1)
    .run();
}

async function countRows(table: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function createInput(): Extract<ApplyChangeInput, { intent: "createOrder" }> {
  return {
    orderId: "order-idempotent",
    intent: "createOrder",
    payload: {
      customerId: "cust-1",
      serviceType: "wash_fold",
      deliverySlotId: "slot-1",
      items: [{ description: "Shirt", quantity: 2 }],
    },
    baseVersion: null,
    mutationId: "mutation-idempotent-1",
  };
}

function reorderedCreateInput(): Extract<
  ApplyChangeInput,
  { intent: "createOrder" }
> {
  const input = createInput();
  return {
    mutationId: input.mutationId,
    baseVersion: input.baseVersion,
    payload: {
      items: input.payload.items,
      deliverySlotId: input.payload.deliverySlotId,
      serviceType: input.payload.serviceType,
      customerId: input.payload.customerId,
    },
    intent: input.intent,
    orderId: input.orderId,
  };
}

async function expectApplyError(
  operation: Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await operation;
    throw new Error("expected applyChange to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(ApplyChangeError);
    const applyError = error as ApplyChangeError;
    expect(applyError.code).toBe(code);
    expect(applyError.status).toBe(status);
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
  await seedSlots();
});

describe("applyChange idempotency", () => {
  it("replays a canonical-equivalent payload without writing new rows", async () => {
    const first = await applyChange(db, manager, createInput(), { now: NOW });
    expect(first.replayed).toBe(false);

    const countsAfterFirst = {
      orders: await countRows("orders"),
      events: await countRows("order_events"),
      changes: await countRows("changes"),
      outbox: await countRows("outbox"),
    };

    const second = await applyChange(db, manager, reorderedCreateInput(), {
      now: NOW + 1_000,
    });

    expect(second.replayed).toBe(true);
    expect(second.order.version).toBe(1);
    expect(await countRows("orders")).toBe(countsAfterFirst.orders);
    expect(await countRows("order_events")).toBe(countsAfterFirst.events);
    expect(await countRows("changes")).toBe(countsAfterFirst.changes);
    expect(await countRows("outbox")).toBe(countsAfterFirst.outbox);
  });

  it("rejects the same mutation ID with a different payload", async () => {
    await applyChange(db, manager, createInput(), { now: NOW });

    const countsBefore = {
      orders: await countRows("orders"),
      events: await countRows("order_events"),
      changes: await countRows("changes"),
      outbox: await countRows("outbox"),
    };

    const changed = {
      ...createInput(),
      payload: {
        ...createInput().payload,
        items: [{ description: "Shirt", quantity: 3 }],
      },
    } as ApplyChangeInput;

    await expectApplyError(
      applyChange(db, manager, changed, { now: NOW + 1_000 }),
      "MUTATION_PAYLOAD_MISMATCH",
      409,
    );

    expect(await countRows("orders")).toBe(countsBefore.orders);
    expect(await countRows("order_events")).toBe(countsBefore.events);
    expect(await countRows("changes")).toBe(countsBefore.changes);
    expect(await countRows("outbox")).toBe(countsBefore.outbox);
  });

  it("does not duplicate event or outbox rows on duplicate create", async () => {
    await applyChange(db, manager, createInput(), { now: NOW });
    await applyChange(db, manager, createInput(), { now: NOW + 1_000 });

    expect(await countRows("order_events")).toBe(1);
    expect(await countRows("changes")).toBe(1);
    expect(await countRows("outbox")).toBe(2);
  });
});
