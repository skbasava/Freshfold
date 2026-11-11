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
const SLOT_FULL_START = Date.parse("2026-11-11T08:30:00.000Z");
const SLOT_FULL_END = Date.parse("2026-11-11T09:30:00.000Z");

const manager: InternalContext = {
  actorId: "manager-1",
  actorType: "user",
  role: "manager",
  tenantId: TEST_TENANT,
  hubId: TEST_HUB,
  exp: NOW + 60_000,
};

const frontDesk: InternalContext = {
  ...manager,
  actorId: "desk-1",
  role: "front_desk",
};

async function seedSlots(): Promise<void> {
  const slots = [
    ["slot-1", TEST_HUB, "2026-11-11-10", "2026-11-11", "10:00", SLOT_1_START, SLOT_1_END, 2, 1],
    ["slot-2", TEST_HUB, "2026-11-11-12", "2026-11-11", "12:00", SLOT_2_START, SLOT_2_END, 2, 1],
    ["slot-full", TEST_HUB, "2026-11-11-14", "2026-11-11", "14:00", SLOT_FULL_START, SLOT_FULL_END, 1, 1],
  ];

  for (const slot of slots) {
    await db
      .prepare(
        "INSERT INTO delivery_slots (id, hub_id, slot_key, local_date, local_start, starts_at, ends_at, capacity, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(...slot, 1)
      .run();
  }
}

async function countRows(table: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .first<{ n: number }>();
  return row?.n ?? 0;
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

function createInput(overrides: Partial<ApplyChangeInput> = {}): ApplyChangeInput {
  return {
    orderId: "order-new",
    intent: "createOrder",
    payload: {
      customerId: "cust-1",
      serviceType: "wash_fold",
      deliverySlotId: "slot-1",
      items: [{ description: "Shirt", quantity: 2 }],
    },
    baseVersion: null,
    mutationId: "mutation-create-1",
    ...overrides,
  } as ApplyChangeInput;
}

function updateInput(
  overrides: Partial<ApplyChangeInput> & { orderId: string; intent: string },
): ApplyChangeInput {
  return {
    payload: {},
    baseVersion: 1,
    mutationId: "mutation-update-1",
    ...overrides,
  } as ApplyChangeInput;
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
  await seedSlots();
});

describe("applyChange create", () => {
  it("commits the order, items, event, change, and both outbox rows", async () => {
    const result = await applyChange(db, manager, createInput(), { now: NOW });

    expect(result.replayed).toBe(false);
    expect(result.order).toMatchObject({
      id: "order-new",
      status: "confirmed",
      version: 1,
      deliverySlotId: "slot-1",
      deliveryAt: SLOT_1_START,
      holdComment: null,
    });
    expect(result.order.items).toHaveLength(1);
    expect(await countRows("order_events")).toBe(1);
    expect(await countRows("changes")).toBe(1);
    expect(await countRows("outbox")).toBe(2);

    const event = await db
      .prepare(
        "SELECT source, actor_id, previous_version, new_version, detail_json FROM order_events WHERE hub_id = ? AND mutation_id = ?",
      )
      .bind(TEST_HUB, "mutation-create-1")
      .first<{
        source: string;
        actor_id: string;
        previous_version: number;
        new_version: number;
        detail_json: string;
      }>();

    expect(event).toMatchObject({
      source: "app",
      actor_id: "manager-1",
      previous_version: 0,
      new_version: 1,
    });
    expect(JSON.parse(event!.detail_json)).toMatchObject({
      previousStatus: null,
      newStatus: "confirmed",
    });
  });

  it("replays the same mutation without writing again", async () => {
    const input = createInput();
    const first = await applyChange(db, manager, input, { now: NOW });
    const second = await applyChange(db, manager, input, { now: NOW + 1 });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.order.version).toBe(1);
    expect(await countRows("orders")).toBe(4);
    expect(await countRows("order_events")).toBe(1);
    expect(await countRows("changes")).toBe(1);
    expect(await countRows("outbox")).toBe(2);
  });

  it("rejects a create when the final slot is full", async () => {
    await applyChange(
      db,
      manager,
      createInput({
        orderId: "order-full-a",
        mutationId: "mutation-full-a",
        payload: {
          customerId: "cust-1",
          serviceType: "wash_fold",
          deliverySlotId: "slot-full",
          items: [{ description: "Shirt", quantity: 1 }],
        },
      }),
      { now: NOW },
    );

    await expectApplyError(
      applyChange(
        db,
        manager,
        createInput({
          orderId: "order-full-b",
          mutationId: "mutation-full-b",
          payload: {
            customerId: "cust-1",
            serviceType: "wash_fold",
            deliverySlotId: "slot-full",
            items: [{ description: "Shirt", quantity: 1 }],
          },
        }),
        { now: NOW },
      ),
      "SLOT_FULL",
      422,
    );

    const rows = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM orders WHERE hub_id = ? AND delivery_slot_id = ?",
      )
      .bind(TEST_HUB, "slot-full")
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
    expect(await countRows("order_events")).toBe(1);
    expect(await countRows("changes")).toBe(1);
    expect(await countRows("outbox")).toBe(2);
  });
});

describe("applyChange updates", () => {
  it("rejects a stale base version without writing", async () => {
    const error = await expectApplyError(
      applyChange(
        db,
        manager,
        updateInput({
          orderId: "order-1",
          intent: "markProcessing",
          baseVersion: 0,
          mutationId: "mutation-stale",
        }),
        { now: NOW },
      ),
      "VERSION_CONFLICT",
      409,
    );

    expect(error.currentOrder?.version).toBe(1);
    expect(await countRows("order_events")).toBe(0);
    expect(await countRows("changes")).toBe(0);
    expect(await countRows("outbox")).toBe(0);
  });

  it("rejects an invalid transition without writing", async () => {
    await expectApplyError(
      applyChange(
        db,
        manager,
        updateInput({
          orderId: "order-2",
          intent: "markProcessing",
          baseVersion: 2,
          mutationId: "mutation-invalid",
        }),
        { now: NOW },
      ),
      "INVALID_TRANSITION",
      422,
    );

    expect(await countRows("order_events")).toBe(0);
    expect(await countRows("changes")).toBe(0);
    expect(await countRows("outbox")).toBe(0);
  });

  it("applies a valid status transition and writes audit and outbox", async () => {
    const result = await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-1",
        intent: "markProcessing",
        baseVersion: 1,
        mutationId: "mutation-processing",
      }),
      { now: NOW },
    );

    expect(result.order.status).toBe("processing");
    expect(result.order.version).toBe(2);
    expect(await countRows("order_events")).toBe(1);
    expect(await countRows("changes")).toBe(1);
    expect(await countRows("outbox")).toBe(2);

    const event = await db
      .prepare(
        "SELECT previous_version, new_version FROM order_events WHERE hub_id = ? AND mutation_id = ?",
      )
      .bind(TEST_HUB, "mutation-processing")
      .first<{ previous_version: number; new_version: number }>();
    expect(event).toEqual({ previous_version: 1, new_version: 2 });
  });

  it("runs the out-for-delivery and delivered transitions", async () => {
    const out = await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-2",
        intent: "markOutForDelivery",
        baseVersion: 2,
        mutationId: "mutation-out",
      }),
      { now: NOW },
    );
    expect(out.order.status).toBe("out_for_delivery");
    expect(out.order.version).toBe(3);

    const delivered = await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-2",
        intent: "markDelivered",
        baseVersion: 3,
        mutationId: "mutation-delivered",
      }),
      { now: NOW + 1 },
    );
    expect(delivered.order.status).toBe("delivered");
    expect(delivered.order.version).toBe(4);
  });

  it("reschedules into a new slot", async () => {
    const result = await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-2",
        intent: "reschedule",
        payload: { deliverySlotId: "slot-2" },
        baseVersion: 2,
        mutationId: "mutation-reschedule",
      }),
      { now: NOW },
    );

    expect(result.order).toMatchObject({
      status: "processing",
      version: 3,
      deliverySlotId: "slot-2",
      deliveryAt: SLOT_2_START,
    });
    expect(await countRows("order_events")).toBe(1);
    expect(await countRows("changes")).toBe(1);
    expect(await countRows("outbox")).toBe(2);
  });

  it("cancels an order and releases its slot", async () => {
    await applyChange(
      db,
      manager,
      createInput({
        orderId: "order-cancel",
        mutationId: "mutation-cancel-create",
        payload: {
          customerId: "cust-1",
          serviceType: "wash_fold",
          deliverySlotId: "slot-full",
          items: [{ description: "Shirt", quantity: 1 }],
        },
      }),
      { now: NOW },
    );

    const cancelled = await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-cancel",
        intent: "cancel",
        payload: { reason: "customer request" },
        baseVersion: 1,
        mutationId: "mutation-cancel",
      }),
      { now: NOW + 1 },
    );

    expect(cancelled.order).toMatchObject({
      status: "cancelled",
      version: 2,
      deliverySlotId: null,
      deliveryAt: null,
      holdComment: null,
    });

    const replacement = await applyChange(
      db,
      manager,
      createInput({
        orderId: "order-replacement",
        mutationId: "mutation-replacement",
        payload: {
          customerId: "cust-1",
          serviceType: "wash_fold",
          deliverySlotId: "slot-full",
          items: [{ description: "Shirt", quantity: 1 }],
        },
      }),
      { now: NOW + 2 },
    );

    expect(replacement.order.id).toBe("order-replacement");
    expect(replacement.order.status).toBe("confirmed");
  });

  it("places an order on hold with a comment and resumes to processing", async () => {
    const held = await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-1",
        intent: "placeOnHold",
        payload: { comments: "Waiting for customer" },
        baseVersion: 1,
        mutationId: "mutation-hold",
      }),
      { now: NOW },
    );

    expect(held.order).toMatchObject({
      status: "hold",
      holdComment: "Waiting for customer",
      version: 2,
    });

    const event = await db
      .prepare(
        "SELECT detail_json FROM order_events WHERE hub_id = ? AND mutation_id = ?",
      )
      .bind(TEST_HUB, "mutation-hold")
      .first<{ detail_json: string }>();
    expect(JSON.parse(event!.detail_json)).toMatchObject({
      previousStatus: "confirmed",
      newStatus: "hold",
      payload: { comments: "Waiting for customer" },
    });

    const released = await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-1",
        intent: "releaseHold",
        baseVersion: 2,
        mutationId: "mutation-release",
      }),
      { now: NOW + 1 },
    );

    expect(released.order).toMatchObject({
      status: "processing",
      holdComment: null,
      version: 3,
    });
  });

  it("keeps held orders in capacity until cancelled", async () => {
    await applyChange(
      db,
      manager,
      createInput({
        orderId: "order-held",
        mutationId: "mutation-held-create",
        payload: {
          customerId: "cust-1",
          serviceType: "wash_fold",
          deliverySlotId: "slot-full",
          items: [{ description: "Shirt", quantity: 1 }],
        },
      }),
      { now: NOW },
    );

    await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-held",
        intent: "placeOnHold",
        payload: { comments: "Customer delay" },
        baseVersion: 1,
        mutationId: "mutation-held",
      }),
      { now: NOW + 1 },
    );

    await expectApplyError(
      applyChange(
        db,
        manager,
        createInput({
          orderId: "order-held-competitor",
          mutationId: "mutation-held-competitor",
          payload: {
            customerId: "cust-1",
            serviceType: "wash_fold",
            deliverySlotId: "slot-full",
            items: [{ description: "Shirt", quantity: 1 }],
          },
        }),
        { now: NOW + 2 },
      ),
      "SLOT_FULL",
      422,
    );
  });

  it("reschedules and cancels a held order while clearing the comment on cancel", async () => {
    await applyChange(
      db,
      manager,
      createInput({
        orderId: "order-held-cancel",
        mutationId: "mutation-held-cancel-create",
        payload: {
          customerId: "cust-1",
          serviceType: "wash_fold",
          deliverySlotId: "slot-full",
          items: [{ description: "Shirt", quantity: 1 }],
        },
      }),
      { now: NOW },
    );

    await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-held-cancel",
        intent: "placeOnHold",
        payload: { comments: "Check stain" },
        baseVersion: 1,
        mutationId: "mutation-held-cancel-hold",
      }),
      { now: NOW + 1 },
    );

    const rescheduled = await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-held-cancel",
        intent: "reschedule",
        payload: { deliverySlotId: "slot-2" },
        baseVersion: 2,
        mutationId: "mutation-held-cancel-reschedule",
      }),
      { now: NOW + 2 },
    );
    expect(rescheduled.order).toMatchObject({
      status: "hold",
      holdComment: "Check stain",
      deliverySlotId: "slot-2",
    });

    const cancelled = await applyChange(
      db,
      manager,
      updateInput({
        orderId: "order-held-cancel",
        intent: "cancel",
        baseVersion: 3,
        mutationId: "mutation-held-cancel",
      }),
      { now: NOW + 3 },
    );
    expect(cancelled.order).toMatchObject({
      status: "cancelled",
      holdComment: null,
      deliverySlotId: null,
    });
  });

  it("lets the front desk place and release holds", async () => {
    const held = await applyChange(
      db,
      frontDesk,
      updateInput({
        orderId: "order-1",
        intent: "placeOnHold",
        payload: { comments: "Customer asked to wait" },
        baseVersion: 1,
        mutationId: "mutation-desk-hold",
      }),
      { now: NOW },
    );
    expect(held.order.status).toBe("hold");

    const released = await applyChange(
      db,
      frontDesk,
      updateInput({
        orderId: "order-1",
        intent: "releaseHold",
        baseVersion: 2,
        mutationId: "mutation-desk-release",
      }),
      { now: NOW + 1 },
    );
    expect(released.order.status).toBe("processing");
  });

  it("enforces intent permissions and hub scope", async () => {
    await expectApplyError(
      applyChange(
        db,
        frontDesk,
        updateInput({
          orderId: "order-1",
          intent: "cancel",
          baseVersion: 1,
          mutationId: "mutation-desk-cancel",
        }),
        { now: NOW },
      ),
      "FORBIDDEN",
      403,
    );

    await expectApplyError(
      applyChange(
        db,
        frontDesk,
        updateInput({
          orderId: "order-2",
          intent: "reschedule",
          payload: { deliverySlotId: "slot-2" },
          baseVersion: 2,
          mutationId: "mutation-desk-reschedule",
        }),
        { now: NOW },
      ),
      "FORBIDDEN",
      403,
    );

    await expectApplyError(
      applyChange(
        db,
        manager,
        updateInput({
          orderId: "order-3",
          intent: "markProcessing",
          baseVersion: 1,
          mutationId: "mutation-cross-hub",
        }),
        { now: NOW },
      ),
      "NOT_FOUND",
      404,
    );

    expect(await countRows("order_events")).toBe(0);
    expect(await countRows("changes")).toBe(0);
    expect(await countRows("outbox")).toBe(0);
  });
});
