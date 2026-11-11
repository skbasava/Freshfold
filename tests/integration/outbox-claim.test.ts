import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { InternalContext } from "../../packages/contracts/src/auth";
import type { OutboxQueueMessage } from "../../packages/contracts/src/queue-messages";
import { applyChange } from "../../workers/laundry/src/orders/apply-change";
import {
  claimOutbox,
  markOutboxDone,
  markOutboxFailed,
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_MAX_ATTEMPTS,
} from "../../workers/laundry/src/outbox/claim";
import { dispatchOutboxBatch } from "../../workers/laundry/src/outbox/dispatch";
import {
  clearLaundryData,
  seedLaundryReadFixtures,
  TEST_HUB,
  TEST_TENANT,
} from "../helpers/laundry-db";

type TestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as TestEnv;
const db = testEnv.LAUNDRY_DB;

type OutboxSeed = {
  id: string;
  hubId?: string;
  orderId?: string;
  destination?: "calendar" | "notification";
  operation?: string;
  targetVersion?: number;
  mutationId?: string;
  status?: "pending" | "dispatching" | "done" | "failed";
  attempts?: number;
  nextAttemptAt?: number;
  leaseToken?: string | null;
  leaseExpiresAt?: number | null;
  lastError?: string | null;
  createdAt?: number;
};

async function insertOutbox(seed: OutboxSeed): Promise<void> {
  await db
    .prepare(
      `INSERT INTO outbox (
        id, hub_id, order_id, destination, operation, target_version,
        mutation_id, status, attempts, next_attempt_at, lease_token,
        lease_expires_at, last_error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      seed.id,
      seed.hubId ?? TEST_HUB,
      seed.orderId ?? `order-${seed.id}`,
      seed.destination ?? "calendar",
      seed.operation ?? "UPSERT_EVENT",
      seed.targetVersion ?? 1,
      seed.mutationId ?? `mut-${seed.id}`,
      seed.status ?? "pending",
      seed.attempts ?? 0,
      seed.nextAttemptAt ?? 0,
      seed.leaseToken ?? null,
      seed.leaseExpiresAt ?? null,
      seed.lastError ?? null,
      seed.createdAt ?? 0,
    )
    .run();
}

async function getOutbox(id: string) {
  return db
    .prepare("SELECT * FROM outbox WHERE id = ?")
    .bind(id)
    .first<{
      status: string;
      attempts: number;
      next_attempt_at: number;
      lease_token: string | null;
      lease_expires_at: number | null;
      last_error: string | null;
      completed_at: number | null;
    }>();
}

function fakeQueue() {
  const sent: OutboxQueueMessage[] = [];
  return {
    sent,
    send: async (message: OutboxQueueMessage): Promise<void> => {
      sent.push(message);
    },
  };
}

const manager: InternalContext = {
  actorId: "manager-1",
  actorType: "user",
  role: "manager",
  tenantId: TEST_TENANT,
  hubId: TEST_HUB,
  exp: Date.parse("2026-11-11T04:05:00.000Z"),
};

async function seedSlot(): Promise<void> {
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
      Date.parse("2026-11-11T04:30:00.000Z"),
      Date.parse("2026-11-11T05:30:00.000Z"),
      2,
      1,
      1,
    )
    .run();
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
});

describe("outbox claim", () => {
  it("claims each eligible row once and increments attempts", async () => {
    await insertOutbox({ id: "outbox-1" });
    await insertOutbox({ id: "outbox-2" });

    const first = await claimOutbox(db, { now: 1_000, limit: 10 });
    const second = await claimOutbox(db, { now: 1_000, limit: 10 });

    expect(first.map((row) => row.id).sort()).toEqual(["outbox-1", "outbox-2"]);
    expect(first.every((row) => row.status === "dispatching")).toBe(true);
    expect(first.every((row) => row.attempts === 1)).toBe(true);
    expect(first.every((row) => row.leaseToken)).toBe(true);
    expect(second).toEqual([]);
  });

  it("partitions rows across concurrent claims", async () => {
    await insertOutbox({ id: "outbox-1" });
    await insertOutbox({ id: "outbox-2" });

    const [left, right] = await Promise.all([
      claimOutbox(db, { now: 1_000, limit: 10 }),
      claimOutbox(db, { now: 1_000, limit: 10 }),
    ]);

    const ids = [...left, ...right].map((row) => row.id);
    expect(ids.sort()).toEqual(["outbox-1", "outbox-2"]);
    expect(new Set(ids).size).toBe(2);
  });

  it("reclaims an expired lease with a new token", async () => {
    await insertOutbox({ id: "outbox-1" });

    const first = await claimOutbox(db, {
      now: 1_000,
      limit: 1,
      leaseMs: 100,
    });
    const second = await claimOutbox(db, {
      now: 1_200,
      limit: 1,
      leaseMs: 100,
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]?.attempts).toBe(2);
    expect(second[0]?.leaseToken).not.toBe(first[0]?.leaseToken);
  });

  it("applies backoff after a failed send", async () => {
    await insertOutbox({ id: "outbox-1" });
    const [row] = await claimOutbox(db, { now: 1_000, limit: 1 });

    const marked = await markOutboxFailed(
      db,
      { id: row!.id, leaseToken: row!.leaseToken!, attempts: row!.attempts },
      1_000,
      "queue unavailable",
    );

    expect(marked).toBe(true);
    const stored = await getOutbox("outbox-1");
    expect(stored?.status).toBe("pending");
    expect(stored?.attempts).toBe(1);
    expect(stored?.next_attempt_at).toBe(1_000 + OUTBOX_BACKOFF_BASE_MS);
    expect(stored?.last_error).toBe("queue unavailable");
    expect(stored?.lease_token).toBeNull();

    expect(await claimOutbox(db, { now: 1_000 + OUTBOX_BACKOFF_BASE_MS - 1 })).toEqual([]);
    expect(await claimOutbox(db, { now: 1_000 + OUTBOX_BACKOFF_BASE_MS })).toHaveLength(1);
  });

  it("marks a row failed after the maximum attempts", async () => {
    await insertOutbox({
      id: "outbox-1",
      attempts: OUTBOX_MAX_ATTEMPTS - 1,
    });
    const [row] = await claimOutbox(db, { now: 1_000, limit: 1 });

    await markOutboxFailed(
      db,
      { id: row!.id, leaseToken: row!.leaseToken!, attempts: row!.attempts },
      1_000,
      "terminal",
    );

    const stored = await getOutbox("outbox-1");
    expect(row?.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
    expect(stored?.status).toBe("failed");
    expect(stored?.last_error).toBe("terminal");
    expect(await claimOutbox(db, { now: 10_000_000 })).toEqual([]);
  });

  it("marks done only with the current lease", async () => {
    await insertOutbox({ id: "outbox-1" });
    const [row] = await claimOutbox(db, { now: 1_000, limit: 1 });

    expect(await markOutboxDone(db, row!.id, "wrong-token", 2_000)).toBe(false);
    expect(await markOutboxDone(db, row!.id, row!.leaseToken!, 2_000)).toBe(true);

    const stored = await getOutbox("outbox-1");
    expect(stored?.status).toBe("done");
    expect(stored?.completed_at).toBe(2_000);
    expect(stored?.lease_token).toBeNull();
  });
});

describe("outbox dispatch", () => {
  it("sends to the right queue and does not duplicate work", async () => {
    await insertOutbox({ id: "outbox-1", destination: "calendar" });
    await insertOutbox({
      id: "outbox-2",
      destination: "notification",
      operation: "SEND_STATUS",
    });

    const calendar = fakeQueue();
    const notifications = fakeQueue();
    const first = await dispatchOutboxBatch(
      db,
      {
        CALENDAR_QUEUE: calendar as unknown as Queue<OutboxQueueMessage>,
        NOTIFY_QUEUE: notifications as unknown as Queue<OutboxQueueMessage>,
      },
      { now: 1_000, limit: 10 },
    );

    expect(first).toEqual({ claimed: 2, sent: 2, failed: 0 });
    expect(calendar.sent).toHaveLength(1);
    expect(notifications.sent).toHaveLength(1);
    expect(calendar.sent[0]).toEqual({
      outboxId: "outbox-1",
      hubId: TEST_HUB,
      orderId: "order-outbox-1",
      destination: "calendar",
      operation: "UPSERT_EVENT",
      targetVersion: 1,
      mutationId: "mut-outbox-1",
    });

    const second = await dispatchOutboxBatch(
      db,
      {
        CALENDAR_QUEUE: calendar as unknown as Queue<OutboxQueueMessage>,
        NOTIFY_QUEUE: notifications as unknown as Queue<OutboxQueueMessage>,
      },
      { now: 1_000, limit: 10 },
    );

    expect(second).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(calendar.sent).toHaveLength(1);
    expect(notifications.sent).toHaveLength(1);
  });

  it("records a queue failure and schedules a retry", async () => {
    await insertOutbox({ id: "outbox-1" });
    const calendar = {
      send: async (): Promise<void> => {
        throw new Error("queue unavailable");
      },
    };

    const result = await dispatchOutboxBatch(
      db,
      {
        CALENDAR_QUEUE: calendar as unknown as Queue<OutboxQueueMessage>,
      },
      { now: 1_000, limit: 1 },
    );

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });
    const stored = await getOutbox("outbox-1");
    expect(stored?.status).toBe("pending");
    expect(stored?.last_error).toBe("queue unavailable");
    expect(stored?.next_attempt_at).toBe(1_000 + OUTBOX_BACKOFF_BASE_MS);
  });

  it("dispatches work committed by applyChange after a simulated crash", async () => {
    await seedLaundryReadFixtures(db);
    await seedSlot();

    const result = await applyChange(db, manager, {
      orderId: "order-crash",
      intent: "createOrder",
      baseVersion: null,
      mutationId: "mut-crash",
      payload: {
        customerId: "cust-1",
        serviceType: "wash",
        deliverySlotId: "slot-1",
        items: [{ description: "Shirt", quantity: 1 }],
      },
    }, { now: Date.parse("2026-11-11T04:00:00.000Z") });

    expect(result.replayed).toBe(false);
    const pending = await db
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE order_id = ? AND status = 'pending'")
      .bind("order-crash")
      .first<{ n: number }>();
    expect(pending?.n).toBe(2);

    const calendar = fakeQueue();
    const notifications = fakeQueue();
    const sweep = await dispatchOutboxBatch(
      db,
      {
        CALENDAR_QUEUE: calendar as unknown as Queue<OutboxQueueMessage>,
        NOTIFY_QUEUE: notifications as unknown as Queue<OutboxQueueMessage>,
      },
      { now: Date.parse("2026-11-11T04:00:00.000Z"), limit: 10 },
    );

    expect(sweep).toEqual({ claimed: 2, sent: 2, failed: 0 });
    expect(calendar.sent).toHaveLength(1);
    expect(notifications.sent).toHaveLength(1);
    const remaining = await db
      .prepare("SELECT COUNT(*) AS n FROM outbox WHERE order_id = ? AND status = 'done'")
      .bind("order-crash")
      .first<{ n: number }>();
    expect(remaining?.n).toBe(2);
  });
});
