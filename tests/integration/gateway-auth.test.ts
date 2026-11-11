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
import { seedAuthUser } from "../helpers/auth-db";

type AuthTestEnv = {
  AUTH_DB: D1Database;
  TEST_AUTH_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as AuthTestEnv;
const db = testEnv.AUTH_DB;

const authBinding: Fetcher = {
  fetch: (request: Request) =>
    auth.fetch(request, { AUTH_DB: db }, createExecutionContext()),
} as Fetcher;

async function requestGateway(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(`https://gateway.test${path}`, init);
  const ctx = createExecutionContext();
  const response = await gateway.fetch(request, { AUTH: authBinding }, ctx);
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

function sessionCookie(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) {
    throw new Error("missing set-cookie header");
  }

  return header.split(";")[0] ?? "";
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

describe("gateway session verification", () => {
  it("forwards login and serves the trusted session context", async () => {
    await seedDeskUser();

    const login = await requestGateway("/auth/login", loginRequest());
    expect(login.status).toBe(200);
    const cookie = sessionCookie(login);

    const me = await requestGateway("/api/me", {
      headers: {
        cookie,
        "x-role": "manager",
        "x-hub-id": "hub-2",
        "x-tenant-id": "tenant-evil",
      },
    });

    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      actorId: "user-desk",
      actorType: "user",
      role: "front_desk",
      tenantId: "tenant-1",
      hubId: "hub-1",
    });
  });

  it("rejects missing and invalid sessions", async () => {
    const missing = await requestGateway("/api/me");
    const invalid = await requestGateway("/api/me", {
      headers: { cookie: "laundry_session=not-a-real-token" },
    });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "unauthorized" });
    expect(await invalid.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects expired and revoked sessions", async () => {
    await seedDeskUser();
    const login = await requestGateway("/auth/login", loginRequest());
    const cookie = sessionCookie(login);

    await db
      .prepare("UPDATE sessions SET expires_at = ?")
      .bind(Date.now() - 1)
      .run();
    const expired = await requestGateway("/api/me", { headers: { cookie } });
    expect(expired.status).toBe(401);

    await db.prepare("UPDATE sessions SET revoked_at = ?, expires_at = ?")
      .bind(Date.now(), Date.now() + 60_000)
      .run();
    const revoked = await requestGateway("/api/me", { headers: { cookie } });
    expect(revoked.status).toBe(401);
  });

  it("proxies the session endpoint without trusting client identity headers", async () => {
    await seedDeskUser();
    const login = await requestGateway("/auth/login", loginRequest());
    const cookie = sessionCookie(login);

    const session = await requestGateway("/auth/session", {
      headers: { cookie, "x-role": "manager" },
    });

    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      user: { id: "user-desk" },
      hub: { id: "hub-1" },
      role: "front_desk",
    });
  });
});
