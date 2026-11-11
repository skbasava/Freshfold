import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { InternalContext } from "../../packages/contracts/src/auth";
import type { SignedContext } from "../../packages/contracts/src/http";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../packages/contracts/src/http";
import type { OutboxQueueMessage } from "../../packages/contracts/src/queue-messages";
import { signInternalContext } from "../../packages/shared/src/internal-context";
import laundry from "../../workers/laundry/src/index";
import {
  clearLaundryData,
  TEST_HUB,
  TEST_TENANT,
} from "../helpers/laundry-db";

type TestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as TestEnv;
const db = testEnv.LAUNDRY_DB;
const SECRET = "test-internal-context-secret-32-bytes";

async function insertOutbox(
  id: string,
  destination: "calendar" | "notification",
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO outbox (
        id, hub_id, order_id, destination, operation, target_version,
        mutation_id, status, attempts, next_attempt_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, 0)`,
    )
    .bind(
      id,
      TEST_HUB,
      `order-${id}`,
      destination,
      destination === "calendar" ? "UPSERT_EVENT" : "SEND_STATUS",
      1,
      `mut-${id}`,
    )
    .run();
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

async function postSweep(
  actorType: "system" | "user",
  body: unknown,
): Promise<Response> {
  const authNow = Date.now();
  const context: InternalContext = {
    actorId: actorType === "system" ? "system:scheduler" : "manager-1",
    actorType,
    role: actorType === "system" ? "service" : "manager",
    tenantId: actorType === "system" ? "system" : TEST_TENANT,
    hubId: actorType === "system" ? "system" : TEST_HUB,
    exp: authNow + 60_000,
  };
  const signed = await signInternalContext({
    context: {
      ...context,
      iat: authNow,
      nonce: crypto.randomUUID(),
    } satisfies SignedContext,
    secret: SECRET,
  });

  const request = new Request(
    "https://laundry.internal/internal/outbox/sweep",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INTERNAL_CONTEXT_HEADER]: signed.encoded,
        [INTERNAL_SIGNATURE_HEADER]: signed.signature,
        [INTERNAL_KEY_ID_HEADER]: signed.keyId,
      },
      body: JSON.stringify(body),
    },
  );

  const ctx = createExecutionContext();
  const response = await laundry.fetch(
    request,
    {
      LAUNDRY_DB: db,
      INTERNAL_CONTEXT_SECRET: SECRET,
      SERVICE_TOKEN: "test-service-token-32-characters-long",
    } as never,
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
});

describe("outbox sweep route", () => {
  it("dispatches pending rows for a signed system actor", async () => {
    await insertOutbox("outbox-1", "calendar");
    await insertOutbox("outbox-2", "notification");
    const calendarQueue = fakeQueue();
    const notifyQueue = fakeQueue();

    const now = 10_000;
    const authNow = Date.now();
    const context: InternalContext = {
      actorId: "system:scheduler",
      actorType: "system",
      role: "service",
      tenantId: "system",
      hubId: "system",
      exp: authNow + 60_000,
    };
    const signed = await signInternalContext({
      context: {
        ...context,
        iat: authNow,
        nonce: crypto.randomUUID(),
      } satisfies SignedContext,
      secret: SECRET,
    });
    const request = new Request(
      "https://laundry.internal/internal/outbox/sweep",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_CONTEXT_HEADER]: signed.encoded,
          [INTERNAL_SIGNATURE_HEADER]: signed.signature,
          [INTERNAL_KEY_ID_HEADER]: signed.keyId,
        },
        body: JSON.stringify({ now, limit: 10 }),
      },
    );
    const ctx = createExecutionContext();
    const response = await laundry.fetch(
      request,
      {
        LAUNDRY_DB: db,
        INTERNAL_CONTEXT_SECRET: SECRET,
        SERVICE_TOKEN: "test-service-token-32-characters-long",
        CALENDAR_QUEUE: calendarQueue,
        NOTIFY_QUEUE: notifyQueue,
      } as never,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 2,
      sent: 2,
      failed: 0,
    });
    expect(calendarQueue.sent.map((message) => message.outboxId)).toEqual([
      "outbox-1",
    ]);
    expect(notifyQueue.sent.map((message) => message.outboxId)).toEqual([
      "outbox-2",
    ]);

    const statuses = await db
      .prepare("SELECT id, status FROM outbox ORDER BY id")
      .all<{ id: string; status: string }>();
    expect(statuses.results).toEqual([
      { id: "outbox-1", status: "done" },
      { id: "outbox-2", status: "done" },
    ]);
  });

  it("denies a user actor", async () => {
    await insertOutbox("outbox-1", "calendar");
    const response = await postSweep("user", { now: 10_000, limit: 10 });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  it("rejects an invalid body", async () => {
    const response = await postSweep("system", { now: 10_000, limit: 0 });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });
});
