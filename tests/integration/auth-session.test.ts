import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import auth from "../../workers/auth/src/index";
import { seedAuthUser } from "../helpers/auth-db";

type AuthTestEnv = {
  AUTH_DB: D1Database;
  TEST_AUTH_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as AuthTestEnv;
const db = testEnv.AUTH_DB;

async function requestAuth(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(`https://auth.test${path}`, init);
  const ctx = createExecutionContext();
  const response = await auth.fetch(request, { AUTH_DB: db }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function loginRequest(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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

describe("auth login", () => {
  it("creates a secure session cookie and stores only token hashes", async () => {
    await seedDeskUser();

    const response = await requestAuth(
      "/login",
      loginRequest({
        email: "  DESK@example.com ",
        password: "correct horse battery staple",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      user: {
        id: "user-desk",
        email: "desk@example.com",
        displayName: "Desk User",
      },
      hub: { id: "hub-1", tenantId: "tenant-1" },
      role: "front_desk",
    });
    expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(typeof body.expiresAt).toBe("number");

    const cookieHeader = response.headers.get("set-cookie") ?? "";
    expect(cookieHeader).toContain("laundry_session=");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("Secure");
    expect(cookieHeader).toContain("SameSite=Lax");
    expect(cookieHeader).toContain("Path=/");
    expect(cookieHeader).not.toContain("Domain=");

    const rawToken = sessionCookie(response).split("=")[1] ?? "";
    const row = await db
      .prepare("SELECT token_hash, csrf_hash FROM sessions")
      .first<{ token_hash: string; csrf_hash: string }>();
    expect(row?.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row?.token_hash).not.toBe(rawToken);
    expect(row?.csrf_hash).not.toBe(body.csrfToken);
  });

  it("rejects a wrong password and an unknown email with the same error", async () => {
    await seedDeskUser();

    const wrongPassword = await requestAuth(
      "/login",
      loginRequest({
        email: "desk@example.com",
        password: "wrong password",
      }),
    );
    const unknownEmail = await requestAuth(
      "/login",
      loginRequest({
        email: "missing@example.com",
        password: "correct horse battery staple",
      }),
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(await wrongPassword.json()).toEqual({
      error: "invalid_credentials",
    });
    expect(await unknownEmail.json()).toEqual({
      error: "invalid_credentials",
    });
  });

  it("rejects a hub the user does not belong to", async () => {
    await seedDeskUser();

    const response = await requestAuth(
      "/login",
      loginRequest({
        email: "desk@example.com",
        password: "correct horse battery staple",
        hubId: "hub-2",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "hub_not_allowed" });
  });

  it("ignores a client-supplied role", async () => {
    await seedDeskUser();

    const response = await requestAuth(
      "/login",
      loginRequest({
        email: "desk@example.com",
        password: "correct horse battery staple",
        role: "manager",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ role: "front_desk" });
  });
});

describe("auth session and logout", () => {
  it("returns the session, rejects missing or invalid cookies, and revokes on logout", async () => {
    await seedDeskUser();
    const login = await requestAuth(
      "/login",
      loginRequest({
        email: "desk@example.com",
        password: "correct horse battery staple",
      }),
    );
    const loginBody = await login.json<{ csrfToken: string }>();
    const cookie = sessionCookie(login);

    const session = await requestAuth("/session", {
      headers: { cookie },
    });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      user: { id: "user-desk" },
      hub: { id: "hub-1", tenantId: "tenant-1" },
      role: "front_desk",
    });

    const missing = await requestAuth("/session");
    const invalid = await requestAuth("/session", {
      headers: { cookie: "laundry_session=not-a-real-token" },
    });
    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);

    const logoutWithoutCsrf = await requestAuth("/logout", {
      method: "POST",
      headers: { cookie },
    });
    expect(logoutWithoutCsrf.status).toBe(403);

    const logout = await requestAuth("/logout", {
      method: "POST",
      headers: {
        cookie,
        "x-csrf-token": loginBody.csrfToken,
      },
    });
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const revoked = await requestAuth("/session", { headers: { cookie } });
    expect(revoked.status).toBe(401);
  });

  it("rejects an expired session", async () => {
    await seedDeskUser();
    const login = await requestAuth(
      "/login",
      loginRequest({
        email: "desk@example.com",
        password: "correct horse battery staple",
      }),
    );
    const cookie = sessionCookie(login);

    await db
      .prepare("UPDATE sessions SET expires_at = ?")
      .bind(Date.now() - 1)
      .run();

    const session = await requestAuth("/session", { headers: { cookie } });
    expect(session.status).toBe(401);
  });

  it("reflects a role change from the membership source of truth", async () => {
    await seedDeskUser();
    const login = await requestAuth(
      "/login",
      loginRequest({
        email: "desk@example.com",
        password: "correct horse battery staple",
      }),
    );
    const cookie = sessionCookie(login);

    await db
      .prepare(
        "UPDATE user_hub_memberships SET role = 'manager' WHERE user_id = ?",
      )
      .bind("user-desk")
      .run();

    const session = await requestAuth("/session", { headers: { cookie } });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ role: "manager" });
  });

  it("returns a trusted internal context for the gateway", async () => {
    await seedDeskUser();
    const login = await requestAuth(
      "/login",
      loginRequest({
        email: "desk@example.com",
        password: "correct horse battery staple",
      }),
    );
    const cookie = sessionCookie(login);

    const response = await requestAuth("/internal/session", {
      headers: { cookie, "x-role": "manager", "x-hub-id": "hub-2" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      actorId: "user-desk",
      actorType: "user",
      role: "front_desk",
      tenantId: "tenant-1",
      hubId: "hub-1",
    });
  });
});
