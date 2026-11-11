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
import { seedAuthUser } from "../helpers/auth-db";

type AuthTestEnv = {
  AUTH_DB: D1Database;
  TEST_AUTH_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as AuthTestEnv;
const db = testEnv.AUTH_DB;
const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";
const SESSION_COOKIE = "laundry_session";

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

function setCookieHeader(response: Response, name: string): string {
  const header = response.headers
    .getSetCookie()
    .find((candidate) => candidate.startsWith(`${name}=`));

  if (!header) {
    throw new Error(`missing cookie ${name}`);
  }

  return header;
}

function cookieValue(response: Response, name: string): string {
  return setCookieHeader(response, name).split(";")[0]!.slice(name.length + 1);
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

describe("gateway CSRF protection", () => {
  it("sets a readable CSRF cookie and a protected session cookie", async () => {
    await seedDeskUser();

    const login = await requestGateway(
      "/auth/login",
      loginRequest(),
      createLaundryBinding([]),
    );

    expect(login.status).toBe(200);
    const csrf = setCookieHeader(login, CSRF_COOKIE);
    const session = setCookieHeader(login, SESSION_COOKIE);

    expect(csrf).toContain("Secure");
    expect(csrf).toContain("SameSite=Lax");
    expect(csrf).toContain("Path=/");
    expect(csrf.toLowerCase()).not.toContain("httponly");

    expect(session.toLowerCase()).toContain("httponly");
    expect(session).toContain("Secure");
    expect(session).toContain("SameSite=Lax");
  });

  it("rejects a state-changing request without a CSRF token", async () => {
    await seedDeskUser();
    const login = await requestGateway(
      "/auth/login",
      loginRequest(),
      createLaundryBinding([]),
    );
    const captured: Request[] = [];

    const response = await requestGateway(
      "/api/orders",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader(login),
        },
        body: "{}",
      },
      createLaundryBinding(captured),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "csrf_failed" });
    expect(captured).toHaveLength(0);
  });

  it("rejects a mismatched CSRF token", async () => {
    await seedDeskUser();
    const login = await requestGateway(
      "/auth/login",
      loginRequest(),
      createLaundryBinding([]),
    );
    const captured: Request[] = [];

    const response = await requestGateway(
      "/api/orders",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader(login),
          [CSRF_HEADER]: "wrong-token",
        },
        body: "{}",
      },
      createLaundryBinding(captured),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "csrf_failed" });
    expect(captured).toHaveLength(0);
  });

  it("accepts a matching CSRF token and cookie", async () => {
    await seedDeskUser();
    const login = await requestGateway(
      "/auth/login",
      loginRequest(),
      createLaundryBinding([]),
    );
    const captured: Request[] = [];

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
      createLaundryBinding(captured),
    );

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.method).toBe("POST");
    expect(captured[0]?.url).toBe("https://laundry.internal/api/orders");
  });

  it("does not require CSRF for safe reads", async () => {
    await seedDeskUser();
    const login = await requestGateway(
      "/auth/login",
      loginRequest(),
      createLaundryBinding([]),
    );
    const captured: Request[] = [];

    const response = await requestGateway(
      "/api/orders",
      { headers: { cookie: cookieHeader(login) } },
      createLaundryBinding(captured),
    );

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.method).toBe("GET");
  });

  it("clears both cookies on logout", async () => {
    await seedDeskUser();
    const login = await requestGateway(
      "/auth/login",
      loginRequest(),
      createLaundryBinding([]),
    );

    const logout = await requestGateway(
      "/auth/logout",
      {
        method: "POST",
        headers: {
          cookie: cookieHeader(login),
          [CSRF_HEADER]: cookieValue(login, CSRF_COOKIE),
        },
      },
      createLaundryBinding([]),
    );

    expect(logout.status).toBe(204);
    const clearedSession = setCookieHeader(logout, SESSION_COOKIE);
    const clearedCsrf = setCookieHeader(logout, CSRF_COOKIE);
    expect(clearedSession).toContain("Max-Age=0");
    expect(clearedCsrf).toContain("Max-Age=0");
  });
});
