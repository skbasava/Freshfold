import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import auth from "../../workers/auth/src/index";
import gateway from "../../workers/gateway/src/index";
import { verifyInternalContext } from "../../packages/shared/src/internal-context";
import { seedAuthUser } from "../helpers/auth-db";

type AuthTestEnv = {
  AUTH_DB: D1Database;
  TEST_AUTH_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as AuthTestEnv;
const db = testEnv.AUTH_DB;
const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const authBinding: Fetcher = {
  fetch: (request: Request) =>
    auth.fetch(request, { AUTH_DB: db }, createExecutionContext()),
} as Fetcher;

function permissiveLimiter() {
  return {
    limit: async (_options: { key: string }) => ({ success: true }),
  };
}

function createLaundryBinding(captured: Request[]): Fetcher {
  return {
    fetch: async (request: Request) => {
      captured.push(request.clone());
      return Response.json({ ok: true });
    },
  } as Fetcher;
}

async function requestGateway(
  path: string,
  init: RequestInit | undefined,
  laundry: Fetcher,
): Promise<Response> {
  const request = new Request(`https://gateway.test${path}`, init);
  const ctx = createExecutionContext();
  const response = await gateway.fetch(
    request,
    {
      AUTH: authBinding,
      LAUNDRY: laundry,
      INTERNAL_CONTEXT_SECRET,
      INTERNAL_CONTEXT_KEY_ID: "v1",
      LOGIN_RATE_LIMITER: permissiveLimiter(),
      MUTATION_RATE_LIMITER: permissiveLimiter(),
    },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

function loginRequest(): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "desk@example.com",
      password: "correct horse battery staple",
    }),
  };
}

function cookieValue(response: Response, name: string): string {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    if (pair?.startsWith(`${name}=`)) {
      return pair.slice(name.length + 1);
    }
  }

  throw new Error(`missing cookie ${name}`);
}

async function seedDeskUser(): Promise<void> {
  await seedAuthUser(db, {
    id: "user-desk",
    email: "desk@example.com",
    password: "correct horse battery staple",
    displayName: "Desk User",
    memberships: [
      { tenantId: "tenant-1", hubId: "hub-1", role: "front_desk" },
    ],
  });
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_AUTH_MIGRATIONS);
});

beforeEach(async () => {
  await db.exec(
    "DELETE FROM sessions; DELETE FROM user_hub_memberships; DELETE FROM users;",
  );
});

describe("gateway request pipeline", () => {
  it("assigns a correlation ID to every business response", async () => {
    const laundry = createLaundryBinding([]);
    const response = await requestGateway("/health", undefined, laundry);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(UUID_PATTERN);
  });

  it("rejects invalid payloads with 400 and no stack trace", async () => {
    const laundry = createLaundryBinding([]);
    const response = await requestGateway(
      "/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "" }),
      },
      laundry,
    );

    expect(response.status).toBe(400);
    const body = await response.json<Record<string, unknown>>();
    expect(body.error).toBe("invalid_request");
    expect(body.requestId).toBe(response.headers.get("x-request-id"));
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("signs and forwards trusted context without client identity headers", async () => {
    await seedDeskUser();
    const captured: Request[] = [];
    const laundry = createLaundryBinding(captured);

    const login = await requestGateway("/auth/login", loginRequest(), laundry);
    expect(login.status).toBe(200);
    const cookies = `laundry_session=${cookieValue(login, "laundry_session")}`;
    captured.length = 0;

    const response = await requestGateway(
      "/api/orders?status=new",
      {
        headers: {
          cookie: cookies,
          "x-role": "manager",
          "x-hub-id": "hub-2",
          "x-tenant-id": "tenant-evil",
          "x-internal-context": "spoofed",
        },
      },
      laundry,
    );

    expect(response.status).toBe(200);
    const forwarded = captured[0];
    expect(forwarded).toBeDefined();
    if (!forwarded) {
      return;
    }

    expect(forwarded.headers.get("cookie")).toBeNull();
    expect(forwarded.headers.get("x-role")).toBeNull();
    expect(forwarded.headers.get("x-hub-id")).toBeNull();
    expect(forwarded.headers.get("x-tenant-id")).toBeNull();
    expect(forwarded.headers.get("x-request-id")).toBe(
      response.headers.get("x-request-id"),
    );

    const verified = await verifyInternalContext({
      encoded: forwarded.headers.get("x-internal-context"),
      signature: forwarded.headers.get("x-internal-signature"),
      keyId: forwarded.headers.get("x-internal-key-id"),
      secret: INTERNAL_CONTEXT_SECRET,
    });

    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      return;
    }

    expect(verified.context).toMatchObject({
      actorId: "user-desk",
      actorType: "user",
      role: "front_desk",
      tenantId: "tenant-1",
      hubId: "hub-1",
    });
    expect(forwarded.method).toBe("GET");
    expect(forwarded.url).toBe("https://laundry.internal/api/orders?status=new");
  });
});
