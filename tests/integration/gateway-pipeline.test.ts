import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import gateway from "../../workers/gateway/src/index";
import { verifyInternalContext } from "../../packages/shared/src/internal-context";
import type { GatewayBindings } from "../../workers/gateway/src/types";
import {
  createTestKey,
  jwksFetch,
  signSupabaseToken,
  SUPABASE_AUDIENCE,
  SUPABASE_ISSUER,
  SUPABASE_JWKS_URL,
  SUPABASE_NOW_MS,
  testClaims,
  type TestKey,
} from "../helpers/supabase";

const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let key: TestKey;

beforeAll(async () => {
  key = await createTestKey("key-pipeline", "RS256");
});

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
  const jwks = jwksFetch([key]);
  const bindings: GatewayBindings = {
    LAUNDRY: laundry,
    INTERNAL_CONTEXT_SECRET,
    INTERNAL_CONTEXT_KEY_ID: "v1",
    MUTATION_RATE_LIMITER: permissiveLimiter(),
    SUPABASE_JWKS_URL,
    SUPABASE_JWT_ISSUER: SUPABASE_ISSUER,
    SUPABASE_JWT_AUDIENCE: SUPABASE_AUDIENCE,
    SUPABASE_JWKS_FETCH: jwks.fetchImpl,
    SUPABASE_CLOCK: () => SUPABASE_NOW_MS,
  };
  const request = new Request(`https://gateway.test${path}`, init);
  const ctx = createExecutionContext();
  const response = await gateway.fetch(request, bindings, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("gateway request pipeline", () => {
  it("assigns a correlation ID to every business response", async () => {
    const laundry = createLaundryBinding([]);
    const response = await requestGateway("/health", undefined, laundry);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(UUID_PATTERN);
  });

  it("rejects malformed bearer tokens with structured JSON and no stack trace", async () => {
    const laundry = createLaundryBinding([]);
    const response = await requestGateway(
      "/api/me",
      {
        headers: { authorization: "Bearer not-a-jwt" },
      },
      laundry,
    );

    expect(response.status).toBe(401);
    const body = await response.json<Record<string, unknown>>();
    expect(body.error).toBe("invalid_token");
    expect(body.requestId).toBe(response.headers.get("x-request-id"));
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("signs and forwards trusted context without client identity headers", async () => {
    const captured: Request[] = [];
    const laundry = createLaundryBinding(captured);
    const token = await signSupabaseToken(key, testClaims());

    const response = await requestGateway(
      "/api/orders?status=new",
      {
        headers: {
          authorization: `Bearer ${token}`,
          cookie: "laundry_session=ignored",
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

    expect(forwarded.headers.get("authorization")).toBeNull();
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
      actorId: "subject-desk",
      actorType: "user",
      role: "front_desk",
      tenantId: "tenant-1",
      hubId: "hub-1",
    });
    expect(forwarded.method).toBe("GET");
    expect(forwarded.url).toBe("https://laundry.internal/api/orders?status=new");
  });
});
