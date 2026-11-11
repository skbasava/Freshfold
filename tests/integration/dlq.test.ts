import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalContext } from "../../packages/contracts/src/auth";
import type { SignedContext } from "../../packages/contracts/src/http";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  SERVICE_HUB_HEADER,
  SERVICE_NAME_HEADER,
  SERVICE_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
} from "../../packages/contracts/src/http";
import type { OutboxQueueMessage } from "../../packages/contracts/src/queue-messages";
import { signInternalContext } from "../../packages/shared/src/internal-context";
import laundry from "../../workers/laundry/src/index";
import {
  DLQ_CALENDAR_QUEUE,
  DLQ_NOTIFY_QUEUE,
  handleDlqBatch,
  listFailedOutbox,
  replayOutbox,
  type DlqBatch,
} from "../../workers/scheduler/src/dlq";
import scheduler from "../../workers/scheduler/src/index";
import { clearLaundryData, TEST_HUB, TEST_TENANT } from "../helpers/laundry-db";

type TestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as TestEnv;
const db = testEnv.LAUNDRY_DB;
const SECRET = "test-internal-context-secret-32-bytes";
const SERVICE_TOKEN = "test-service-token-32-characters-long";
const ADMIN_TOKEN = "test-admin-token-32-characters-long";

type ActorType = "system" | "user";

async function requestLaundry(options: {
  method: "GET" | "POST";
  path: string;
  actorType?: ActorType;
  body?: unknown;
}): Promise<Response> {
  const authNow = Date.now();
  const actorType = options.actorType ?? "system";
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

  const headers = new Headers({
    [INTERNAL_CONTEXT_HEADER]: signed.encoded,
    [INTERNAL_SIGNATURE_HEADER]: signed.signature,
    [INTERNAL_KEY_ID_HEADER]: signed.keyId,
  });
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const request = new Request(`https://laundry.internal${options.path}`, {
    method: options.method,
    headers,
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const ctx = createExecutionContext();
  const response = await laundry.fetch(
    request,
    {
      LAUNDRY_DB: db,
      INTERNAL_CONTEXT_SECRET: SECRET,
      SERVICE_TOKEN,
    } as never,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

async function insertOutbox(
  id: string,
  options: {
    status?: "pending" | "dispatching" | "done" | "failed";
    createdAt?: number;
    destination?: "calendar" | "notification";
    attempts?: number;
  } = {},
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO outbox (
        id, hub_id, order_id, destination, operation, target_version,
        mutation_id, status, attempts, next_attempt_at, lease_token,
        lease_expires_at, last_error, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      TEST_HUB,
      `order-${id}`,
      options.destination ?? "calendar",
      (options.destination ?? "calendar") === "calendar"
        ? "UPSERT_EVENT"
        : "SEND_STATUS",
      1,
      `mut-${id}`,
      options.status ?? "failed",
      options.attempts ?? 8,
      500,
      "old-lease",
      999,
      "boom",
      options.createdAt ?? 100,
      options.status === "done" ? 200 : null,
    )
    .run();
}

function fakeLaundry(
  handler: (request: Request) => Response | Promise<Response>,
) {
  const requests: Request[] = [];
  const binding = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return handler(request);
    },
  };
  return { requests, binding: binding as unknown as Fetcher };
}

async function requestScheduler(options: {
  method: "GET" | "POST";
  path: string;
  token?: string;
  body?: unknown;
  laundry: Fetcher;
}): Promise<Response> {
  const headers = new Headers();
  if (options.token !== undefined) {
    headers.set("x-admin-token", options.token);
  }
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const request = new Request(`https://scheduler.internal${options.path}`, {
    method: options.method,
    headers,
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const ctx = createExecutionContext();
  const response = await scheduler.fetch(
    request,
    {
      LAUNDRY: options.laundry,
      DLQ_ADMIN_TOKEN: ADMIN_TOKEN,
      SERVICE_TOKEN,
    } as never,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

const failedItem = {
  id: "outbox-failed",
  hubId: TEST_HUB,
  orderId: "order-outbox-failed",
  destination: "calendar" as const,
  operation: "UPSERT_EVENT",
  targetVersion: 1,
  attempts: 8,
  lastError: "boom",
  createdAt: 100,
  completedAt: null,
};

function validMessage(
  overrides: Partial<OutboxQueueMessage> = {},
): OutboxQueueMessage {
  return {
    outboxId: "outbox-failed",
    hubId: TEST_HUB,
    orderId: "order-outbox-failed",
    destination: "calendar",
    operation: "UPSERT_EVENT",
    targetVersion: 1,
    mutationId: "mut-outbox-failed",
    ...overrides,
  };
}

function fakeDlqMessage(body: unknown, attempts = 3) {
  let ackCount = 0;
  let retryCount = 0;
  return {
    body,
    attempts,
    get ackCount() {
      return ackCount;
    },
    get retryCount() {
      return retryCount;
    },
    ack() {
      ackCount += 1;
    },
    retry() {
      retryCount += 1;
    },
  };
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("laundry DLQ inspection and replay routes", () => {
  it("lists failed outbox rows in creation order with a total", async () => {
    await insertOutbox("outbox-late", { createdAt: 300 });
    await insertOutbox("outbox-early", { createdAt: 100 });
    await insertOutbox("outbox-done", { status: "done", createdAt: 50 });

    const response = await requestLaundry({
      method: "GET",
      path: "/internal/outbox/failed?limit=10",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: Array<typeof failedItem>;
      total: number;
    };
    expect(body.total).toBe(2);
    expect(body.items.map((item) => item.id)).toEqual([
      "outbox-early",
      "outbox-late",
    ]);
    expect(body.items[0]).toEqual({
      ...failedItem,
      id: "outbox-early",
      orderId: "order-outbox-early",
    });
  });

  it("resets a failed row to pending and replays idempotently", async () => {
    await insertOutbox("outbox-failed");
    await insertOutbox("outbox-pending", { status: "pending", attempts: 2 });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const first = await requestLaundry({
      method: "POST",
      path: "/internal/outbox/replay",
      body: { outboxId: "outbox-failed", now: 12_345 },
    });

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ replayed: true });

    const replayed = await db
      .prepare(
        `SELECT status, attempts, next_attempt_at, lease_token,
                lease_expires_at, last_error, completed_at
         FROM outbox WHERE id = ?`,
      )
      .bind("outbox-failed")
      .first<{
        status: string;
        attempts: number;
        next_attempt_at: number;
        lease_token: string | null;
        lease_expires_at: number | null;
        last_error: string | null;
        completed_at: number | null;
      }>();
    expect(replayed).toEqual({
      status: "pending",
      attempts: 0,
      next_attempt_at: 12_345,
      lease_token: null,
      lease_expires_at: null,
      last_error: null,
      completed_at: null,
    });

    const untouched = await db
      .prepare("SELECT status, attempts FROM outbox WHERE id = ?")
      .bind("outbox-pending")
      .first<{ status: string; attempts: number }>();
    expect(untouched).toEqual({ status: "pending", attempts: 2 });

    const audit = log.mock.calls
      .map((call) => {
        const value = call[0];
        return typeof value === "string" ? JSON.parse(value) : value;
      })
      .find((record) => record?.event === "outbox_replayed");
    expect(audit).toMatchObject({
      event: "outbox_replayed",
      actorId: "system:scheduler",
      outboxId: "outbox-failed",
    });

    const second = await requestLaundry({
      method: "POST",
      path: "/internal/outbox/replay",
      body: { outboxId: "outbox-failed" },
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ replayed: false });

    const listed = await requestLaundry({
      method: "GET",
      path: "/internal/outbox/failed",
    });
    expect(await listed.json()).toEqual({ items: [], total: 0 });
  });

  it("denies a user actor", async () => {
    await insertOutbox("outbox-failed");

    const list = await requestLaundry({
      method: "GET",
      path: "/internal/outbox/failed",
      actorType: "user",
    });
    expect(list.status).toBe(403);
    expect(await list.json()).toEqual({ error: "forbidden" });

    const replay = await requestLaundry({
      method: "POST",
      path: "/internal/outbox/replay",
      actorType: "user",
      body: { outboxId: "outbox-failed" },
    });
    expect(replay.status).toBe(403);
    expect(await replay.json()).toEqual({ error: "forbidden" });
  });

  it("rejects an invalid replay body and invalid limit", async () => {
    const replay = await requestLaundry({
      method: "POST",
      path: "/internal/outbox/replay",
      body: {},
    });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toEqual({ error: "invalid_request" });

    const list = await requestLaundry({
      method: "GET",
      path: "/internal/outbox/failed?limit=0",
    });
    expect(list.status).toBe(400);
    expect(await list.json()).toEqual({ error: "invalid_request" });
  });
});

describe("scheduler DLQ batch handling", () => {
  it("acks valid and poison messages on both DLQ queues without retry", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    for (const queue of [DLQ_CALENDAR_QUEUE, DLQ_NOTIFY_QUEUE]) {
      const valid = fakeDlqMessage(validMessage(), 3);
      const poison = fakeDlqMessage({ outboxId: 42 }, 4);
      const batch: DlqBatch = { queue, messages: [valid, poison] };

      await handleDlqBatch(batch, { LAUNDRY: {} as Fetcher });

      expect(valid.ackCount).toBe(1);
      expect(valid.retryCount).toBe(0);
      expect(poison.ackCount).toBe(1);
      expect(poison.retryCount).toBe(0);
    }

    const records = errors.mock.calls.map((call) => {
      const value = call[0];
      return typeof value === "string" ? JSON.parse(value) : value;
    });
    const logged = records.filter((record) => record?.event === "dlq_message");
    expect(logged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "dlq_message",
          queue: DLQ_CALENDAR_QUEUE,
          outboxId: "outbox-failed",
          orderId: "order-outbox-failed",
          destination: "calendar",
          targetVersion: 1,
          attempts: 3,
        }),
        expect.objectContaining({
          event: "dlq_message",
          queue: DLQ_NOTIFY_QUEUE,
          outboxId: "outbox-failed",
          attempts: 3,
        }),
      ]),
    );
  });
});

describe("scheduler DLQ client functions", () => {
  it("lists failed rows through the Laundry service binding", async () => {
    const laundry = fakeLaundry(() => Response.json({ items: [failedItem], total: 1 }));

    const result = await listFailedOutbox(
      { LAUNDRY: laundry.binding, SERVICE_TOKEN },
      { limit: 25 },
    );

    expect(result).toEqual({ items: [failedItem], total: 1 });
    const request = laundry.requests[0];
    expect(request.url).toBe(
      "https://laundry.internal/internal/outbox/failed?limit=25",
    );
    expect(request.method).toBe("GET");
    expect(request.headers.get(SERVICE_TOKEN_HEADER)).toBe(SERVICE_TOKEN);
    expect(request.headers.get(SERVICE_NAME_HEADER)).toBe("scheduler");
    expect(request.headers.get(SERVICE_TENANT_HEADER)).toBe("system");
    expect(request.headers.get(SERVICE_HUB_HEADER)).toBe("system");
  });

  it("replays a row through the Laundry service binding", async () => {
    const laundry = fakeLaundry(() => Response.json({ replayed: true }));

    const result = await replayOutbox(
      { LAUNDRY: laundry.binding, SERVICE_TOKEN },
      { outboxId: "outbox-failed" },
    );

    expect(result).toEqual({ replayed: true });
    const request = laundry.requests[0];
    expect(request.url).toBe(
      "https://laundry.internal/internal/outbox/replay",
    );
    expect(request.method).toBe("POST");
    expect(await request.json()).toEqual({ outboxId: "outbox-failed" });
    expect(request.headers.get(SERVICE_TOKEN_HEADER)).toBe(SERVICE_TOKEN);
    expect(request.headers.get(SERVICE_NAME_HEADER)).toBe("scheduler");
  });

  it("throws deterministic errors for missing token and rejected calls", async () => {
    const laundry = fakeLaundry(() =>
      Response.json({ error: "nope" }, { status: 500 }),
    );

    await expect(
      listFailedOutbox({ LAUNDRY: laundry.binding }, { limit: 10 }),
    ).rejects.toThrow("service_token_missing");

    await expect(
      listFailedOutbox(
        { LAUNDRY: laundry.binding, SERVICE_TOKEN },
        { limit: 10 },
      ),
    ).rejects.toThrow("dlq_list_failed");

    await expect(
      replayOutbox(
        { LAUNDRY: laundry.binding, SERVICE_TOKEN },
        { outboxId: "outbox-failed" },
      ),
    ).rejects.toThrow("dlq_replay_failed");
  });
});

describe("scheduler DLQ admin routes", () => {
  it("rejects missing and wrong admin tokens", async () => {
    const laundry = fakeLaundry(() => Response.json({ items: [], total: 0 }));

    const missing = await requestScheduler({
      method: "GET",
      path: "/internal/dlq/failed",
      laundry: laundry.binding,
    });
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "unauthorized" });

    const wrong = await requestScheduler({
      method: "POST",
      path: "/internal/dlq/replay",
      token: "wrong-token",
      body: { outboxId: "outbox-failed" },
      laundry: laundry.binding,
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "unauthorized" });
    expect(laundry.requests).toHaveLength(0);
  });

  it("lists failed rows with a valid admin token", async () => {
    const laundry = fakeLaundry(() =>
      Response.json({ items: [failedItem], total: 1 }),
    );

    const response = await requestScheduler({
      method: "GET",
      path: "/internal/dlq/failed?limit=10",
      token: ADMIN_TOKEN,
      laundry: laundry.binding,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [failedItem], total: 1 });
    expect(laundry.requests[0].url).toBe(
      "https://laundry.internal/internal/outbox/failed?limit=10",
    );
  });

  it("replays with a valid admin token and audits the action", async () => {
    const laundry = fakeLaundry(() => Response.json({ replayed: true }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await requestScheduler({
      method: "POST",
      path: "/internal/dlq/replay",
      token: ADMIN_TOKEN,
      body: { outboxId: "outbox-failed" },
      laundry: laundry.binding,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ replayed: true });
    expect(laundry.requests[0].url).toBe(
      "https://laundry.internal/internal/outbox/replay",
    );

    const audit = log.mock.calls
      .map((call) => {
        const value = call[0];
        return typeof value === "string" ? JSON.parse(value) : value;
      })
      .find((record) => record?.event === "dlq_replay");
    expect(audit).toMatchObject({
      event: "dlq_replay",
      actorId: "admin:dlq",
      outboxId: "outbox-failed",
    });
  });

  it("rejects invalid admin input", async () => {
    const laundry = fakeLaundry(() => Response.json({ replayed: false }));

    const badLimit = await requestScheduler({
      method: "GET",
      path: "/internal/dlq/failed?limit=0",
      token: ADMIN_TOKEN,
      laundry: laundry.binding,
    });
    expect(badLimit.status).toBe(400);
    expect(await badLimit.json()).toEqual({ error: "invalid_request" });

    const badBody = await requestScheduler({
      method: "POST",
      path: "/internal/dlq/replay",
      token: ADMIN_TOKEN,
      body: {},
      laundry: laundry.binding,
    });
    expect(badBody.status).toBe(400);
    expect(await badBody.json()).toEqual({ error: "invalid_request" });
    expect(laundry.requests).toHaveLength(0);
  });
});
