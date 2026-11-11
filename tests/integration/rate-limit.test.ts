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
import {
  CSRF_COOKIE,
  CSRF_HEADER,
} from "../../packages/contracts/src/http";
import type {
  GatewayBindings,
  RateLimitBinding,
} from "../../workers/gateway/src/types";
import { seedAuthUser } from "../helpers/auth-db";

type AuthTestEnv = {
  AUTH_DB: D1Database;
  TEST_AUTH_MIGRATIONS: D1Migration[];
};

type Limiter = {
  binding: RateLimitBinding;
  calls: string[];
};

const testEnv = env as unknown as AuthTestEnv;
const db = testEnv.AUTH_DB;
const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";

function createAuthBinding(counter: { calls: number }): Fetcher {
  return {
    fetch: (request: Request) => {
      counter.calls += 1;
      return auth.fetch(request, { AUTH_DB: db }, createExecutionContext());
    },
  } as Fetcher;
}

function createLimiter(deniedKeys: string[] = []): Limiter {
  const denied = new Set(deniedKeys);
  const calls: string[] = [];

  return {
    calls,
    binding: {
      limit: async ({ key }) => {
        calls.push(key);
        return { success: !denied.has(key) };
      },
    },
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

function bindings(
  authBinding: Fetcher,
  laundry: Fetcher,
  loginLimiter: RateLimitBinding | undefined,
  mutationLimiter: RateLimitBinding | undefined,
  environment?: string,
): GatewayBindings {
  return {
    AUTH: authBinding,
    LAUNDRY: laundry,
    INTERNAL_CONTEXT_SECRET,
    INTERNAL_CONTEXT_KEY_ID: "v1",
    ENVIRONMENT: environment,
    LOGIN_RATE_LIMITER: loginLimiter,
    MUTATION_RATE_LIMITER: mutationLimiter,
  };
}

async function requestGateway(
  path: string,
  init: RequestInit | undefined,
  envBindings: GatewayBindings,
): Promise<Response> {
  const request = new Request(`https://gateway.test${path}`, init);
  const ctx = createExecutionContext();
  const response = await gateway.fetch(request, envBindings, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function loginRequest(ip = "203.0.113.9"): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": ip,
    },
    body: JSON.stringify({
      email: "desk@example.com",
      password: "correct horse battery staple",
    }),
  };
}

function cookieValue(response: Response, name: string): string {
  const header = response.headers
    .getSetCookie()
    .find((candidate) => candidate.startsWith(`${name}=`));

  if (!header) {
    throw new Error(`missing cookie ${name}`);
  }

  return header.split(";")[0]!.slice(name.length + 1);
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .filter(Boolean)
    .join("; ");
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

describe("gateway rate limiting", () => {
  it("limits login attempts by IP before contacting Auth", async () => {
    const authCounter = { calls: 0 };
    const loginLimiter = createLimiter(["login:ip:203.0.113.9"]);
    const mutationLimiter = createLimiter();

    const response = await requestGateway(
      "/auth/login",
      loginRequest(),
      bindings(
        createAuthBinding(authCounter),
        createLaundryBinding([]),
        loginLimiter.binding,
        mutationLimiter.binding,
      ),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
    expect(authCounter.calls).toBe(0);
    expect(loginLimiter.calls).toEqual(["login:ip:203.0.113.9"]);
  });

  it("limits login attempts by normalized account email", async () => {
    const authCounter = { calls: 0 };
    const loginLimiter = createLimiter(["login:account:desk@example.com"]);
    const mutationLimiter = createLimiter();

    const response = await requestGateway(
      "/auth/login",
      loginRequest(),
      bindings(
        createAuthBinding(authCounter),
        createLaundryBinding([]),
        loginLimiter.binding,
        mutationLimiter.binding,
      ),
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
    expect(authCounter.calls).toBe(0);
    expect(loginLimiter.calls).toEqual([
      "login:ip:203.0.113.9",
      "login:account:desk@example.com",
    ]);
  });

  it("limits mutations per tenant, hub, and actor", async () => {
    await seedDeskUser();
    const authCounter = { calls: 0 };
    const loginLimiter = createLimiter();
    const mutationLimiter = createLimiter([
      "mutation:tenant-1:hub-1:user-desk",
    ]);
    const captured: Request[] = [];
    const envBindings = bindings(
      createAuthBinding(authCounter),
      createLaundryBinding(captured),
      loginLimiter.binding,
      mutationLimiter.binding,
    );

    const login = await requestGateway(
      "/auth/login",
      loginRequest(),
      envBindings,
    );
    expect(login.status).toBe(200);
    captured.length = 0;

    const response = await requestGateway(
      "/api/orders",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader(login),
          [CSRF_HEADER]: cookieValue(login, CSRF_COOKIE),
        },
        body: "{}",
      },
      envBindings,
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
    expect(captured).toHaveLength(0);
    expect(mutationLimiter.calls).toEqual([
      "mutation:tenant-1:hub-1:user-desk",
    ]);
  });

  it("does not rate-limit safe reads", async () => {
    await seedDeskUser();
    const authCounter = { calls: 0 };
    const loginLimiter = createLimiter();
    const mutationLimiter = createLimiter();
    const captured: Request[] = [];
    const envBindings = bindings(
      createAuthBinding(authCounter),
      createLaundryBinding(captured),
      loginLimiter.binding,
      mutationLimiter.binding,
    );

    const login = await requestGateway(
      "/auth/login",
      loginRequest(),
      envBindings,
    );
    captured.length = 0;

    const response = await requestGateway(
      "/api/orders",
      { headers: { cookie: cookieHeader(login) } },
      envBindings,
    );

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(mutationLimiter.calls).toHaveLength(0);
  });

  it("fails closed when the login limiter is missing in production", async () => {
    const authCounter = { calls: 0 };

    const response = await requestGateway(
      "/auth/login",
      loginRequest(),
      bindings(
        createAuthBinding(authCounter),
        createLaundryBinding([]),
        undefined,
        createLimiter().binding,
        "production",
      ),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "rate_limit_unavailable",
    });
    expect(authCounter.calls).toBe(0);
  });
});
