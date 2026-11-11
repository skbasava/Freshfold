import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { InternalContext } from "../../packages/contracts/src/auth";
import type { ApplyChangeInput } from "../../packages/contracts/src/mutations";
import { deriveCustomerId } from "../../packages/contracts/src/phone";
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
    ["slot-1", "2026-11-11-10", "10:00", Date.parse("2026-11-11T04:30:00.000Z"), Date.parse("2026-11-11T05:30:00.000Z")],
    ["slot-2", "2026-11-11-12", "12:00", Date.parse("2026-11-11T06:30:00.000Z"), Date.parse("2026-11-11T07:30:00.000Z")],
    ["slot-3", "2026-11-11-14", "14:00", Date.parse("2026-11-11T08:30:00.000Z"), Date.parse("2026-11-11T09:30:00.000Z")],
    ["slot-full", "2026-11-11-16", "16:00", Date.parse("2026-11-11T10:30:00.000Z"), Date.parse("2026-11-11T11:30:00.000Z")],
  ];

  for (const [id, slotKey, localStart, startsAt, endsAt] of slots) {
    await db
      .prepare(
        "INSERT INTO delivery_slots (id, hub_id, slot_key, local_date, local_start, starts_at, ends_at, capacity, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        TEST_HUB,
        slotKey,
        "2026-11-11",
        localStart,
        startsAt,
        endsAt,
        id === "slot-full" ? 1 : 2,
        1,
        1,
      )
      .run();
  }
}

async function countRows(table: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function customerByPhone(phoneNormalized: string) {
  return db
    .prepare(
      "SELECT id, name, phone, phone_normalized FROM customers WHERE hub_id = ? AND phone_normalized = ?",
    )
    .bind(TEST_HUB, phoneNormalized)
    .first<{
      id: string;
      name: string;
      phone: string;
      phone_normalized: string;
    }>();
}

function createInput(
  overrides: {
    orderId?: string;
    mutationId?: string;
    name?: string;
    phone?: string;
    slotId?: string;
  } = {},
): ApplyChangeInput {
  return {
    orderId: overrides.orderId ?? "order-new",
    intent: "createOrder",
    payload: {
      customerName: overrides.name ?? "New Customer",
      customerPhone: overrides.phone ?? "98765 43210",
      serviceType: "wash_fold",
      deliverySlotId: overrides.slotId ?? "slot-1",
      items: [{ description: "Shirt", quantity: 2 }],
    },
    baseVersion: null,
    mutationId: overrides.mutationId ?? "mutation-create-1",
  } as ApplyChangeInput;
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

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
  await seedSlots();
});

describe("applyChange create with customer details", () => {
  it("creates one customer and the order in a single batch", async () => {
    const result = await applyChange(db, manager, createInput(), { now: NOW });

    expect(result.replayed).toBe(false);
    expect(result.customerCreated).toBe(true);
    expect(result.order).toMatchObject({
      id: "order-new",
      status: "confirmed",
      version: 1,
      customerName: "New Customer",
      customerPhone: "+919876543210",
    });
    expect(result.order.customer).toMatchObject({
      id: await deriveCustomerId(TEST_HUB, "+919876543210"),
      name: "New Customer",
      phone: "+919876543210",
    });

    expect(await countRows("customers")).toBe(4);
    expect(await countRows("orders")).toBe(4);
    expect(await countRows("order_events")).toBe(1);
    expect(await countRows("changes")).toBe(1);
    expect(await countRows("outbox")).toBe(2);

    expect(await customerByPhone("+919876543210")).toMatchObject({
      id: await deriveCustomerId(TEST_HUB, "+919876543210"),
      name: "New Customer",
      phone: "+919876543210",
    });

    const event = await db
      .prepare(
        "SELECT detail_json FROM order_events WHERE hub_id = ? AND mutation_id = ?",
      )
      .bind(TEST_HUB, "mutation-create-1")
      .first<{ detail_json: string }>();
    expect(JSON.parse(event!.detail_json)).toMatchObject({
      customerCreated: true,
    });
  });

  it("reuses the same customer for a second order with the same phone", async () => {
    const first = await applyChange(db, manager, createInput(), { now: NOW });
    const second = await applyChange(
      db,
      manager,
      createInput({
        orderId: "order-new-2",
        mutationId: "mutation-create-2",
        slotId: "slot-2",
      }),
      { now: NOW },
    );

    expect(first.customerCreated).toBe(true);
    expect(second.customerCreated).toBe(false);
    expect(second.order.customerId).toBe(first.order.customerId);
    expect(await countRows("customers")).toBe(4);
    expect(await countRows("orders")).toBe(5);
  });

  it("does not create a customer when the target slot is full", async () => {
    await applyChange(
      db,
      manager,
      {
        orderId: "order-fills-slot",
        intent: "createOrder",
        payload: {
          customerId: "cust-1",
          serviceType: "wash_fold",
          deliverySlotId: "slot-full",
          items: [{ description: "Shirt", quantity: 1 }],
        },
        baseVersion: null,
        mutationId: "mutation-fills-slot",
      } as ApplyChangeInput,
      { now: NOW },
    );

    await expectApplyError(
      applyChange(
        db,
        manager,
        createInput({ slotId: "slot-full", phone: "+91 91234 56789" }),
        { now: NOW },
      ),
      "SLOT_FULL",
      422,
    );

    expect(await customerByPhone("+919123456789")).toBeNull();
    expect(await countRows("customers")).toBe(3);
    expect(await countRows("orders")).toBe(4);
    expect(await countRows("order_events")).toBe(1);
    expect(await countRows("changes")).toBe(1);
    expect(await countRows("outbox")).toBe(2);
  });

  it("does not create a customer when the order id already exists", async () => {
    await expectApplyError(
      applyChange(
        db,
        manager,
        createInput({
          orderId: "order-1",
          mutationId: "mutation-existing-order",
          phone: "+91 91234 56789",
        }),
        { now: NOW },
      ),
      "ORDER_EXISTS",
      409,
    );

    expect(await customerByPhone("+919123456789")).toBeNull();
    expect(await countRows("customers")).toBe(3);
    expect(await countRows("orders")).toBe(3);
    expect(await countRows("order_events")).toBe(0);
  });

  it("keeps the existing customer name when the phone matches", async () => {
    const first = await applyChange(
      db,
      manager,
      createInput({ name: "First Name" }),
      { now: NOW },
    );
    const second = await applyChange(
      db,
      manager,
      createInput({
        orderId: "order-new-2",
        mutationId: "mutation-create-2",
        slotId: "slot-2",
        name: "Different Name",
      }),
      { now: NOW },
    );

    expect(first.customerCreated).toBe(true);
    expect(second.customerCreated).toBe(false);
    expect(second.order.customerName).toBe("First Name");
    expect(second.order.customer.name).toBe("First Name");
    expect(await countRows("customers")).toBe(4);
  });

  it("rejects an invalid phone without writing anything", async () => {
    await expectApplyError(
      applyChange(db, manager, createInput({ phone: "call me now" }), { now: NOW }),
      "INVALID_CUSTOMER",
      422,
    );

    expect(await countRows("customers")).toBe(3);
    expect(await countRows("orders")).toBe(3);
    expect(await countRows("order_events")).toBe(0);
    expect(await countRows("changes")).toBe(0);
    expect(await countRows("outbox")).toBe(0);
  });

  it("replays the stored customerCreated value without duplicating writes", async () => {
    const input = createInput();
    const first = await applyChange(db, manager, input, { now: NOW });
    const second = await applyChange(db, manager, input, { now: NOW + 1 });

    expect(first.customerCreated).toBe(true);
    expect(second.replayed).toBe(true);
    expect(second.customerCreated).toBe(true);
    expect(await countRows("customers")).toBe(4);
    expect(await countRows("orders")).toBe(4);
    expect(await countRows("order_events")).toBe(1);
    expect(await countRows("changes")).toBe(1);
    expect(await countRows("outbox")).toBe(2);
  });

  it("converges concurrent creates for the same new phone", async () => {
    const results = await Promise.all([
      applyChange(db, manager, createInput({ orderId: "order-race-1", mutationId: "mutation-race-1", slotId: "slot-1" }), { now: NOW }),
      applyChange(db, manager, createInput({ orderId: "order-race-2", mutationId: "mutation-race-2", slotId: "slot-2" }), { now: NOW }),
    ]);

    expect(await countRows("customers")).toBe(4);
    expect(await countRows("orders")).toBe(5);
    expect(results.filter((result) => result.customerCreated)).toHaveLength(1);
    expect(new Set(results.map((result) => result.order.customerId)).size).toBe(1);
  });

  it("keeps the legacy customerId path unchanged and reports no creation", async () => {
    const result = await applyChange(
      db,
      manager,
      {
        orderId: "order-legacy",
        intent: "createOrder",
        payload: {
          customerId: "cust-1",
          serviceType: "wash_fold",
          deliverySlotId: "slot-1",
          items: [{ description: "Shirt", quantity: 1 }],
        },
        baseVersion: null,
        mutationId: "mutation-legacy",
      } as ApplyChangeInput,
      { now: NOW },
    );

    expect(result.customerCreated).toBe(false);
    expect(result.order.customerId).toBe("cust-1");
    expect(result.order.customerName).toBe("Alice");
    expect(await countRows("customers")).toBe(3);
    expect(await countRows("orders")).toBe(4);
  });
});
