import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
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
import { TEST_HUB, TEST_TENANT } from "./laundry-db";

export type LaundryTestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

export const testEnv = env as unknown as LaundryTestEnv;
export const db = testEnv.LAUNDRY_DB;

export const TEST_SECRET = "test-internal-context-secret-32-bytes";
export const TEST_SERVICE_TOKEN = "test-service-token-32-characters-long";
export const TEST_CALENDAR_ID = "calendar-1";

export const SCENARIO_NOW = Date.parse("2026-11-11T04:00:00.000Z");
export const SLOT_A_START = Date.parse("2026-11-12T04:00:00.000Z");
export const SLOT_B_START = Date.parse("2026-11-12T05:00:00.000Z");
export const SLOT_C_START = Date.parse("2026-11-12T06:00:00.000Z");
export const SLOT_D_START = Date.parse("2026-11-12T07:00:00.000Z");
export const SLOT_DURATION_MS = 3_600_000;

export type FakeQueue = {
  sent: OutboxQueueMessage[];
  failNext: boolean;
  send(message: OutboxQueueMessage): Promise<void>;
};

export function createFakeQueue(): FakeQueue {
  const queue: FakeQueue = {
    sent: [],
    failNext: false,
    async send(message) {
      if (queue.failNext) {
        queue.failNext = false;
        throw new Error("queue_unavailable");
      }
      queue.sent.push(message);
    },
  };
  return queue;
}

export type QueueBindings = {
  CALENDAR_QUEUE?: FakeQueue;
  NOTIFY_QUEUE?: FakeQueue;
};

export function laundryBinding(
  options: { queues?: QueueBindings } = {},
): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const ctx = createExecutionContext();
      const response = await laundry.fetch(
        request,
        {
          LAUNDRY_DB: db,
          INTERNAL_CONTEXT_SECRET: TEST_SECRET,
          SERVICE_TOKEN: TEST_SERVICE_TOKEN,
          LAUNDRY_CLOCK: () => SCENARIO_NOW,
          ...(options.queues ?? {}),
        } as never,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return response;
    },
  } as Fetcher;
}

export async function managerRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const authNow = Date.now();
  const context: InternalContext = {
    actorId: "manager-1",
    actorType: "user",
    role: "manager",
    tenantId: TEST_TENANT,
    hubId: TEST_HUB,
    exp: authNow + 60_000,
  };
  const signed = await signInternalContext({
    context: {
      ...context,
      iat: authNow,
      nonce: crypto.randomUUID(),
    } satisfies SignedContext,
    secret: TEST_SECRET,
  });

  const headers = new Headers(init.headers);
  headers.set(INTERNAL_CONTEXT_HEADER, signed.encoded);
  headers.set(INTERNAL_SIGNATURE_HEADER, signed.signature);
  headers.set(INTERNAL_KEY_ID_HEADER, signed.keyId);
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const request = new Request(`https://laundry.internal${path}`, {
    ...init,
    headers,
  });
  const ctx = createExecutionContext();
  const response = await laundry.fetch(
    request,
    {
      LAUNDRY_DB: db,
      INTERNAL_CONTEXT_SECRET: TEST_SECRET,
      SERVICE_TOKEN: TEST_SERVICE_TOKEN,
      LAUNDRY_CLOCK: () => SCENARIO_NOW,
    } as never,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

export type FakeQueueMessage = {
  body: unknown;
  readonly ackCount: number;
  readonly retryCount: number;
  readonly retryOptions: Array<{ delaySeconds?: number } | undefined>;
};

export function fakeMessage(body: unknown): FakeQueueMessage & {
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
} {
  let ackCount = 0;
  let retryCount = 0;
  const retryOptions: Array<{ delaySeconds?: number } | undefined> = [];

  return {
    body,
    get ackCount() {
      return ackCount;
    },
    get retryCount() {
      return retryCount;
    },
    get retryOptions() {
      return retryOptions;
    },
    ack() {
      ackCount += 1;
    },
    retry(options) {
      retryCount += 1;
      retryOptions.push(options);
    },
  };
}

export async function seedSlot(
  id: string,
  startsAt: number,
  capacity = 2,
): Promise<void> {
  const localDate = new Date(startsAt).toISOString().slice(0, 10);
  await db
    .prepare(
      `INSERT INTO delivery_slots
        (id, hub_id, slot_key, local_date, local_start, starts_at, ends_at,
         capacity, active, created_at)
       VALUES (?, ?, ?, ?, '10:30', ?, ?, ?, 1, ?)`,
    )
    .bind(
      id,
      TEST_HUB,
      `${id}-key`,
      localDate,
      startsAt,
      startsAt + SLOT_DURATION_MS,
      capacity,
      SCENARIO_NOW,
    )
    .run();
}

export type OutboxRow = {
  id: string;
  hub_id: string;
  order_id: string;
  destination: "calendar" | "notification";
  operation: string;
  target_version: number;
  mutation_id: string;
  status: "pending" | "dispatching" | "done" | "failed";
  attempts: number;
  next_attempt_at: number;
  lease_token: string | null;
  lease_expires_at: number | null;
  last_error: string | null;
  created_at: number;
  completed_at: number | null;
};

export async function findOutbox(input: {
  orderId: string;
  destination: "calendar" | "notification";
  targetVersion?: number;
  operation?: string;
}): Promise<OutboxRow | null> {
  const clauses = ["order_id = ?", "hub_id = ?", "destination = ?"];
  const bindings: Array<string | number> = [
    input.orderId,
    TEST_HUB,
    input.destination,
  ];
  if (input.targetVersion !== undefined) {
    clauses.push("target_version = ?");
    bindings.push(input.targetVersion);
  }
  if (input.operation !== undefined) {
    clauses.push("operation = ?");
    bindings.push(input.operation);
  }

  return db
    .prepare(
      `SELECT id, hub_id, order_id, destination, operation, target_version,
              mutation_id, status, attempts, next_attempt_at, lease_token,
              lease_expires_at, last_error, created_at, completed_at
       FROM outbox
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .bind(...bindings)
    .first<OutboxRow>();
}

export function toQueueMessage(row: OutboxRow): OutboxQueueMessage {
  return {
    outboxId: row.id,
    hubId: row.hub_id,
    orderId: row.order_id,
    destination: row.destination,
    operation: row.operation,
    targetVersion: row.target_version,
    mutationId: row.mutation_id,
  };
}
