import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import gateway from "../../workers/gateway/src/index";
import type {
  GatewayBindings,
  RateLimitBinding,
} from "../../workers/gateway/src/types";
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

type Limiter = {
  binding: RateLimitBinding;
  calls: string[];
};

const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";
let key: TestKey;

beforeAll(async () => {
  key = await createTestKey("key-rate", "RS256");
});

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
  laundry: Fetcher,
  mutationLimiter: RateLimitBinding | undefined,
  environment?: string,
): GatewayBindings {
  const jwks = jwksFetch([key]);
  return {
    LAUNDRY: laundry,
    INTERNAL_CONTEXT_SECRET,
    INTERNAL_CONTEXT_KEY_ID: "v1",
    ENVIRONMENT: environment,
    MUTATION_RATE_LIMITER: mutationLimiter,
    SUPABASE_JWKS_URL,
    SUPABASE_JWT_ISSUER: SUPABASE_ISSUER,
    SUPABASE_JWT_AUDIENCE: SUPABASE_AUDIENCE,
    SUPABASE_JWKS_FETCH: jwks.fetchImpl,
    SUPABASE_CLOCK: () => SUPABASE_NOW_MS,
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

describe("gateway rate limiting", () => {
  it("limits mutations per tenant, hub, and actor", async () => {
    const mutationLimiter = createLimiter([
      "mutation:tenant-1:hub-1:subject-desk",
    ]);
    const captured: Request[] = [];
    const envBindings = bindings(
      createLaundryBinding(captured),
      mutationLimiter.binding,
    );
    const token = await signSupabaseToken(key, testClaims());

    const response = await requestGateway(
      "/api/orders",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: "{}",
      },
      envBindings,
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
    expect(captured).toHaveLength(0);
    expect(mutationLimiter.calls).toEqual([
      "mutation:tenant-1:hub-1:subject-desk",
    ]);
  });

  it("does not rate-limit safe reads", async () => {
    const mutationLimiter = createLimiter();
    const captured: Request[] = [];
    const envBindings = bindings(
      createLaundryBinding(captured),
      mutationLimiter.binding,
    );
    const token = await signSupabaseToken(key, testClaims());

    const response = await requestGateway(
      "/api/orders",
      { headers: { authorization: `Bearer ${token}` } },
      envBindings,
    );

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(mutationLimiter.calls).toHaveLength(0);
  });

  it("fails closed when the mutation limiter is missing in production", async () => {
    const captured: Request[] = [];
    const token = await signSupabaseToken(key, testClaims());

    const response = await requestGateway(
      "/api/orders",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: "{}",
      },
      bindings(createLaundryBinding(captured), undefined, "production"),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "rate_limit_unavailable",
    });
    expect(captured).toHaveLength(0);
  });
});
