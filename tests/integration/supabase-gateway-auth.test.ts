import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../packages/contracts/src/http";
import { verifyInternalContext } from "../../packages/shared/src/internal-context";
import gateway from "../../workers/gateway/src/index";
import type { GatewayBindings } from "../../workers/gateway/src/types";
import laundry from "../../workers/laundry/src/index";
import { clearLaundryData, seedLaundryReadFixtures } from "../helpers/laundry-db";
import {
  createTestKey,
  jwksFetch,
  seedEmployee,
  signSupabaseToken,
  SUPABASE_AUDIENCE,
  SUPABASE_ISSUER,
  SUPABASE_JWKS_URL,
  SUPABASE_NOW_MS,
  testClaims,
  type TestKey,
} from "../helpers/supabase";

type LaundryTestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as LaundryTestEnv;
const db = testEnv.LAUNDRY_DB;
const SERVICE_TOKEN = "test-service-token-32-characters-long";
const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";
let key: TestKey;

function permissiveLimiter() {
  return {
    limit: async (_options: { key: string }) => ({ success: true }),
  };
}

function createLaundryBinding(captured: Request[]): Fetcher {
  return {
    fetch: async (request: Request) => {
      captured.push(request.clone());
      const ctx = createExecutionContext();
      const response = await laundry.fetch(
        request,
        {
          LAUNDRY_DB: db,
          SERVICE_TOKEN,
          INTERNAL_CONTEXT_SECRET,
        },
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return response;
    },
  } as Fetcher;
}

function createAuthFallbackBinding(): Fetcher {
  return {
    fetch: async (request: Request) => {
      if (!request.url.endsWith("/internal/session")) {
        return Response.json({ error: "not_found" }, { status: 404 });
      }
      const cookie = request.headers.get("cookie") ?? "";
      if (!cookie.includes("laundry_session=legacy-session")) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      return Response.json({
        actorId: "legacy-user",
        actorType: "user",
        role: "front_desk",
        tenantId: "tenant-1",
        hubId: "hub-1",
        exp: SUPABASE_NOW_MS + 60_000,
      });
    },
  } as Fetcher;
}

function bindings(
  jwks: ReturnType<typeof jwksFetch>,
  captured: Request[],
  overrides: Partial<GatewayBindings> = {},
): GatewayBindings {
  return {
    AUTH: createAuthFallbackBinding(),
    LAUNDRY: createLaundryBinding(captured),
    SERVICE_TOKEN,
    INTERNAL_CONTEXT_SECRET,
    INTERNAL_CONTEXT_KEY_ID: "v1",
    LOGIN_RATE_LIMITER: permissiveLimiter(),
    MUTATION_RATE_LIMITER: permissiveLimiter(),
    SUPABASE_JWKS_URL,
    SUPABASE_JWT_ISSUER: SUPABASE_ISSUER,
    SUPABASE_JWT_AUDIENCE: SUPABASE_AUDIENCE,
    SUPABASE_JWKS_FETCH: jwks.fetchImpl,
    SUPABASE_CLOCK: () => SUPABASE_NOW_MS,
    ...overrides,
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

function bearer(token: string): RequestInit {
  return { headers: { authorization: `Bearer ${token}` } };
}

async function seedDesk(): Promise<void> {
  await seedEmployee(db, {
    id: "employee-desk",
    subject: "subject-desk",
    email: "desk@example.com",
    memberships: [
      { tenantId: "tenant-1", hubId: "hub-1", role: "front_desk" },
    ],
  });
}

async function seedManager(): Promise<void> {
  await seedEmployee(db, {
    id: "employee-manager",
    subject: "subject-manager",
    email: "manager@example.com",
    memberships: [
      { tenantId: "tenant-1", hubId: "hub-1", role: "manager" },
    ],
  });
}

function applyCancelBody(): string {
  return JSON.stringify({
    orderId: "order-1",
    mutationId: "mutation-cancel-1",
    intent: "cancel",
    payload: {},
    baseVersion: 1,
  });
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
  key = await createTestKey("key-1", "RS256");
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
});

describe("gateway Supabase bearer authentication", () => {
  it("derives identity from the verified JWT and Laundry membership", async () => {
    await seedDesk();
    const jwks = jwksFetch([key]);
    const captured: Request[] = [];
    const token = await signSupabaseToken(key, testClaims());

    const response = await requestGateway(
      "/api/orders",
      {
        headers: {
          authorization: `Bearer ${token}`,
          cookie: "laundry_session=legacy-session",
          "x-role": "manager",
          "x-hub-id": "hub-2",
          "x-tenant-id": "tenant-evil",
          "x-employee-id": "employee-evil",
        },
      },
      bindings(jwks, captured),
    );

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(2);
    const resolution = captured[0];
    expect(resolution?.url).toBe(
      "https://laundry.internal/internal/auth/resolve-membership",
    );
    expect(resolution?.method).toBe("POST");
    expect(resolution?.headers.get("x-service-token")).toBe(SERVICE_TOKEN);
    expect(resolution?.headers.get("x-service-name")).toBe("gateway");
    expect(resolution?.headers.get("authorization")).toBeNull();

    const forwarded = captured[1];
    expect(forwarded?.url).toBe("https://laundry.internal/api/orders");
    expect(forwarded?.headers.get("authorization")).toBeNull();
    expect(forwarded?.headers.get("cookie")).toBeNull();
    expect(forwarded?.headers.get("x-role")).toBeNull();
    expect(forwarded?.headers.get("x-hub-id")).toBeNull();
    expect(forwarded?.headers.get("x-tenant-id")).toBeNull();
    expect(forwarded?.headers.get("x-employee-id")).toBeNull();

    const verified = await verifyInternalContext({
      encoded: forwarded?.headers.get(INTERNAL_CONTEXT_HEADER),
      signature: forwarded?.headers.get(INTERNAL_SIGNATURE_HEADER),
      keyId: forwarded?.headers.get(INTERNAL_KEY_ID_HEADER),
      secret: INTERNAL_CONTEXT_SECRET,
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      return;
    }
    expect(verified.context).toMatchObject({
      actorId: "employee-desk",
      actorType: "user",
      role: "front_desk",
      tenantId: "tenant-1",
      hubId: "hub-1",
    });
  });

  it("serves /api/me from the resolved membership", async () => {
    await seedDesk();
    const token = await signSupabaseToken(key, testClaims());

    const response = await requestGateway(
      "/api/me",
      bearer(token),
      bindings(jwksFetch([key]), []),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      actorId: "employee-desk",
      actorType: "user",
      role: "front_desk",
      tenantId: "tenant-1",
      hubId: "hub-1",
    });
  });

  it("rejects missing, malformed, expired, and tampered tokens", async () => {
    await seedDesk();
    const jwks = jwksFetch([key]);
    const envBindings = bindings(jwks, []);
    const expired = await signSupabaseToken(
      key,
      testClaims({ exp: Math.floor(SUPABASE_NOW_MS / 1000) - 61 }),
    );
    const valid = await signSupabaseToken(key, testClaims());
    const tampered = `${valid.slice(0, -2)}aa`;

    const missing = await requestGateway("/api/me", undefined, envBindings);
    const malformed = await requestGateway(
      "/api/me",
      bearer("not-a-jwt"),
      envBindings,
    );
    const expiredResponse = await requestGateway(
      "/api/me",
      bearer(expired),
      envBindings,
    );
    const tamperedResponse = await requestGateway(
      "/api/me",
      bearer(tampered),
      envBindings,
    );

    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "unauthorized" });
    expect(malformed.status).toBe(401);
    expect(await malformed.json()).toMatchObject({ code: "invalid_token" });
    expect(expiredResponse.status).toBe(401);
    expect(await expiredResponse.json()).toMatchObject({
      code: "expired_session",
    });
    expect(tamperedResponse.status).toBe(401);
    expect(await tamperedResponse.json()).toMatchObject({
      code: "invalid_token",
    });
  });

  it("rejects wrong issuer, audience, and algorithm", async () => {
    await seedDesk();
    const envBindings = bindings(jwksFetch([key]), []);
    const wrongIssuer = await signSupabaseToken(
      key,
      testClaims({ iss: "https://evil.example/auth/v1" }),
    );
    const wrongAudience = await signSupabaseToken(
      key,
      testClaims({ aud: "other" }),
    );
    const wrongAlgorithm = await signSupabaseToken(key, testClaims(), {
      alg: "HS256",
    });

    for (const token of [wrongIssuer, wrongAudience, wrongAlgorithm]) {
      const response = await requestGateway(
        "/api/me",
        bearer(token),
        envBindings,
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "invalid_token" });
    }
  });

  it("fails closed when JWKS retrieval fails", async () => {
    await seedDesk();
    const token = await signSupabaseToken(key, testClaims());
    const failingJwks = {
      calls: [] as string[],
      fetchImpl: async () => {
        failingJwks.calls.push(String(SUPABASE_JWKS_URL));
        throw new Error("jwks unavailable");
      },
    };

    const response = await requestGateway(
      "/api/me",
      bearer(token),
      bindings(failingJwks, []),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "identity_provider_unavailable",
    });
  });

  it("denies inactive, revoked, and unknown employees even with a valid JWT", async () => {
    await seedEmployee(db, {
      id: "employee-inactive",
      subject: "subject-inactive",
      status: "inactive",
      memberships: [
        { tenantId: "tenant-1", hubId: "hub-1", role: "front_desk" },
      ],
    });
    await seedEmployee(db, {
      id: "employee-revoked",
      subject: "subject-revoked",
      status: "revoked",
      memberships: [
        { tenantId: "tenant-1", hubId: "hub-1", role: "manager" },
      ],
    });
    const envBindings = bindings(jwksFetch([key]), []);

    const inactive = await requestGateway(
      "/api/me",
      bearer(await signSupabaseToken(key, testClaims({ sub: "subject-inactive" }))),
      envBindings,
    );
    const revoked = await requestGateway(
      "/api/me",
      bearer(await signSupabaseToken(key, testClaims({ sub: "subject-revoked" }))),
      envBindings,
    );
    const missing = await requestGateway(
      "/api/me",
      bearer(await signSupabaseToken(key, testClaims({ sub: "subject-missing" }))),
      envBindings,
    );

    expect(inactive.status).toBe(403);
    expect(await inactive.json()).toMatchObject({
      code: "membership_inactive",
    });
    expect(revoked.status).toBe(403);
    expect(await revoked.json()).toMatchObject({
      code: "membership_inactive",
    });
    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({
      code: "membership_missing",
    });
  });

  it("allows manager mutations without CSRF and denies front-desk mutations", async () => {
    await seedManager();
    const jwks = jwksFetch([key]);
    const managerToken = await signSupabaseToken(
      key,
      testClaims({ sub: "subject-manager" }),
    );
    const managerResponse = await requestGateway(
      "/api/orders/apply-change",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerToken}`,
          "content-type": "application/json",
        },
        body: applyCancelBody(),
      },
      bindings(jwks, []),
    );

    expect(managerResponse.status).toBe(200);
    const managerBody = await managerResponse.json<{
      order: { status: string };
    }>();
    expect(managerBody.order.status).toBe("cancelled");

    await seedEmployee(db, {
      id: "employee-desk-2",
      subject: "subject-desk-2",
      memberships: [
        { tenantId: "tenant-1", hubId: "hub-1", role: "front_desk" },
      ],
    });
    const deskToken = await signSupabaseToken(
      key,
      testClaims({ sub: "subject-desk-2" }),
    );
    const deskResponse = await requestGateway(
      "/api/orders/apply-change",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${deskToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          orderId: "order-2",
          mutationId: "mutation-cancel-desk",
          intent: "cancel",
          payload: {},
          baseVersion: 2,
        }),
      },
      bindings(jwksFetch([key]), []),
    );

    expect(deskResponse.status).toBe(403);
    expect(await deskResponse.json()).toMatchObject({ error: "FORBIDDEN" });
  });

  it("does not downgrade an invalid bearer token to the local cookie fallback", async () => {
    await seedDesk();
    const response = await requestGateway(
      "/api/me",
      {
        headers: {
          authorization: "Bearer not-a-jwt",
          cookie: "laundry_session=legacy-session",
        },
      },
      bindings(jwksFetch([key]), []),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "invalid_token" });
  });

  it("keeps the Auth Worker fallback local-only", async () => {
    for (const environment of ["staging", "production"]) {
      const envBindings = bindings(jwksFetch([key]), [], {
        ENVIRONMENT: environment,
      });

      const me = await requestGateway(
        "/api/me",
        { headers: { cookie: "laundry_session=legacy-session" } },
        envBindings,
      );
      const login = await requestGateway(
        "/auth/login",
        { method: "POST", body: "{}" },
        envBindings,
      );

      expect(me.status).toBe(401);
      expect(login.status).toBe(404);
    }
  });
});
