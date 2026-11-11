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
import { signInternalContext } from "../../packages/shared/src/internal-context";
import laundry from "../../workers/laundry/src/index";
import { clearLaundryData, TEST_HUB } from "../helpers/laundry-db";

type TestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as TestEnv;
const db = testEnv.LAUNDRY_DB;
const SECRET = "test-internal-context-secret-32-bytes";

async function insertOutbox(
  id: string,
  status: string,
  createdAt: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO outbox (
        id, hub_id, order_id, destination, operation, target_version,
        mutation_id, status, attempts, next_attempt_at, created_at
      ) VALUES (?, ?, ?, 'calendar', 'UPSERT_EVENT', 1, ?, ?, 0, ?, ?)`,
    )
    .bind(
      id,
      TEST_HUB,
      `order-${id}`,
      `mut-${id}`,
      status,
      createdAt,
      createdAt,
    )
    .run();
}

async function signedHeaders(): Promise<Record<string, string>> {
  const now = Date.now();
  const context: InternalContext = {
    actorId: "system:scheduler",
    actorType: "system",
    role: "service",
    tenantId: "system",
    hubId: "system",
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

  return {
    [INTERNAL_CONTEXT_HEADER]: signed.encoded,
    [INTERNAL_SIGNATURE_HEADER]: signed.signature,
    [INTERNAL_KEY_ID_HEADER]: signed.keyId,
  };
}

async function getHealth(now: number): Promise<Response> {
  const request = new Request(
    `https://laundry.internal/internal/outbox/health?now=${now}`,
    { headers: await signedHeaders() },
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

describe("outbox health route", () => {
  it("reports pending, dispatching, failed and oldest pending age", async () => {
    await insertOutbox("outbox-pending-1", "pending", 5_000);
    await insertOutbox("outbox-pending-2", "pending", 3_000);
    await insertOutbox("outbox-dispatching", "dispatching", 2_000);
    await insertOutbox("outbox-failed", "failed", 1_000);
    await insertOutbox("outbox-done", "done", 500);

    const response = await getHealth(100_000);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pending: 2,
      dispatching: 1,
      failed: 1,
      oldestPendingAt: 2_000,
      oldestPendingAgeSeconds: 98,
      checkedAt: 100_000,
    });
  });

  it("returns a zero-age health snapshot for an empty outbox", async () => {
    const response = await getHealth(100_000);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pending: 0,
      dispatching: 0,
      failed: 0,
      oldestPendingAt: null,
      oldestPendingAgeSeconds: 0,
      checkedAt: 100_000,
    });
  });

  it("rejects an invalid now value", async () => {
    const request = new Request(
      "https://laundry.internal/internal/outbox/health?now=nope",
      { headers: await signedHeaders() },
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

    expect(response.status).toBe(400);
  });
});
