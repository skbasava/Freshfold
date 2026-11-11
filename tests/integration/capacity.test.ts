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
const SLOT_2_START = Date.parse("2026-11-11T06:30:00.000Z");
const SLOT_2_END = Date.parse("2026-11-11T07:30:00.000Z");
const SLOT_FINAL_START = Date.parse("2026-11-11T08:30:00.000Z");
const SLOT_FINAL_END = Date.parse("2026-11-11T09:30:00.000Z");
const SLOT_EARLY_START = Date.parse("2026-11-11T02:30:00.000Z");
const SLOT_EARLY_END = Date.parse("2026-11-11T03:30:00.000Z");

const manager: InternalContext = {
  actorId: "manager-1",
  actorType: "user",
  role: "manager",
  tenantId: TEST_TENANT,
  hubId: TEST_HUB,
  exp: NOW + 60_000,
};

async function seedSlots(): Promise<void> {
  const slots = [
    ["slot-1", "10:00", SLOT_1_START, SLOT_1_END, 1],
    ["slot-2", "12:00", SLOT_2_START, SLOT_2_END, 1],
    ["slot-final", "14:00", SLOT_FINAL_START, SLOT_FINAL_END, 1],
    ["slot-early", "08:00", SLOT_EARLY_START, SLOT_EARLY_END, 1],
  ];

  for (const slot of slots) {
    await db
      .prepare(
        "INSERT INTO delivery_slots (id, hub_id, slot_key, local_date, local_start, starts_at, ends_at, capacity, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        slot[0],
        TEST_HUB,
        `2026-11-11-${slot[1]}`,
        "2026-11-11",
        slot[1],
        slot[2],
        slot[3],
        slot[4],
        1,
        1,
      )
      .run();
  }
}

function createInput(
  orderId: string,
  slotId: string,
  mutationId: string,
): Extract<ApplyChangeInput, { intent: "createOrder" }> {
  return {
    orderId,
    intent: "createOrder",
    payload: {
      customerId: "cust-1",
      serviceType: "wash_fold",
      deliverySlotId: slotId,
      items: [{ description: "Shirt", quantity: 1 }],
    },
    baseVersion: null,
    mutationId,
  };
}

async function expectApplyError(
  operation: Promise<unknown>,
  code: string,
  status: number,
): Promise<ApplyChangeError> {
  try {
    await operation;
    throw new Error("expected applyChange to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(ApplyChangeError);
    const applyError = error as ApplyChangeError;
    expect(applyError.code).toBe(code);
    expect(applyError.status).toBe(status);
    return applyError;
  }
}

async function countForSlot(slotId: string): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE hub_id = ? AND delivery_slot_id = ?",
    )
    .bind(TEST_HUB, slotId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
  await seedSlots();
});

describe("slot timing and capacity", () => {
  it("rejects a create outside business hours without writing", async () => {
    await expectApplyError(
      applyChange(
        db,
        manager,
        createInput("order-early", "slot-early", "mutation-early"),
        { now: NOW },
      ),
      "INVALID_SLOT",
      422,
    );

    expect(await countForSlot("slot-early")).toBe(0);
  });

  it("rejects a reschedule outside business hours and keeps the order unchanged", async () => {
    await applyChange(
      db,
      manager,
      createInput("order-a", "slot-1", "mutation-create-a"),
      { now: NOW },
    );

    await expectApplyError(
      applyChange(
        db,
        manager,
        {
          orderId: "order-a",
          intent: "reschedule",
          payload: { deliverySlotId: "slot-early" },
          baseVersion: 1,
          mutationId: "mutation-reschedule-early",
        },
        { now: NOW + 1 },
      ),
      "INVALID_SLOT",
      422,
    );

    const order = await db
      .prepare(
        "SELECT delivery_slot_id, version FROM orders WHERE id = ? AND hub_id = ?",
      )
      .bind("order-a", TEST_HUB)
      .first<{ delivery_slot_id: string; version: number }>();
    expect(order).toEqual({ delivery_slot_id: "slot-1", version: 1 });
  });

  it("lets exactly one concurrent create take the final slot", async () => {
    const results = await Promise.allSettled([
      applyChange(
        db,
        manager,
        createInput("order-first", "slot-final", "mutation-first"),
        { now: NOW },
      ),
      applyChange(
        db,
        manager,
        createInput("order-second", "slot-final", "mutation-second"),
        { now: NOW },
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult)
      .reason as ApplyChangeError;
    expect(error).toBeInstanceOf(ApplyChangeError);
    expect(error.code).toBe("SLOT_FULL");
    expect(await countForSlot("slot-final")).toBe(1);

    const events = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM order_events WHERE hub_id = ? AND mutation_id IN (?, ?)",
      )
      .bind(TEST_HUB, "mutation-first", "mutation-second")
      .first<{ n: number }>();
    expect(events?.n).toBe(1);
  });

  it("releases the old slot atomically when a reschedule fails", async () => {
    await applyChange(
      db,
      manager,
      createInput("order-a", "slot-1", "mutation-create-a"),
      { now: NOW },
    );
    await applyChange(
      db,
      manager,
      createInput("order-b", "slot-2", "mutation-create-b"),
      { now: NOW },
    );

    await expectApplyError(
      applyChange(
        db,
        manager,
        {
          orderId: "order-a",
          intent: "reschedule",
          payload: { deliverySlotId: "slot-2" },
          baseVersion: 1,
          mutationId: "mutation-reschedule-a",
        },
        { now: NOW + 1 },
      ),
      "SLOT_FULL",
      422,
    );

    const stillInSlotOne = await db
      .prepare(
        "SELECT delivery_slot_id, version FROM orders WHERE id = ? AND hub_id = ?",
      )
      .bind("order-a", TEST_HUB)
      .first<{ delivery_slot_id: string; version: number }>();
    expect(stillInSlotOne).toEqual({
      delivery_slot_id: "slot-1",
      version: 1,
    });

    await applyChange(
      db,
      manager,
      {
        orderId: "order-b",
        intent: "cancel",
        payload: {},
        baseVersion: 1,
        mutationId: "mutation-cancel-b",
      },
      { now: NOW + 2 },
    );

    const rescheduled = await applyChange(
      db,
      manager,
      {
        orderId: "order-a",
        intent: "reschedule",
        payload: { deliverySlotId: "slot-2" },
        baseVersion: 1,
        mutationId: "mutation-reschedule-a-2",
      },
      { now: NOW + 3 },
    );

    expect(rescheduled.order.deliverySlotId).toBe("slot-2");
    expect(rescheduled.order.version).toBe(2);
    expect(await countForSlot("slot-1")).toBe(0);
    expect(await countForSlot("slot-2")).toBe(1);
  });
});
