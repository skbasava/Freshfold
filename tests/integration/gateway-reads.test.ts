import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { Role } from "../../packages/contracts/src/auth";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../packages/contracts/src/http";
import { verifyInternalContext } from "../../packages/shared/src/internal-context";
import gateway from "../../workers/gateway/src/index";
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
let key: TestKey;

beforeAll(async () => {
  key = await createTestKey("key-reads", "RS256");
});

function createLaundryBinding(captured: Request[]): Fetcher {
  return {
    fetch: async (request: Request) => {
      captured.push(request.clone());
      return Response.json({ items: [], nextCursor: null });
    },
  } as Fetcher;
}

async function tokenForRole(role: Role): Promise<string> {
  return signSupabaseToken(
    key,
    testClaims({
      sub: `user-${role}`,
      app_metadata: {
        role,
        tenant_id: "tenant-1",
        hub_id: "hub-1",
        status: "active",
      },
    }),
  );
}

async function requestGateway(
  path: string,
  options: { role?: Role; headers?: Record<string, string> },
  laundry: Fetcher,
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.role) {
    headers.set("authorization", `Bearer ${await tokenForRole(options.role)}`);
  }
  const jwks = jwksFetch([key]);
  const bindings: GatewayBindings = {
    LAUNDRY: laundry,
    INTERNAL_CONTEXT_SECRET,
    INTERNAL_CONTEXT_KEY_ID: "v1",
    SUPABASE_JWKS_URL,
    SUPABASE_JWT_ISSUER: SUPABASE_ISSUER,
    SUPABASE_JWT_AUDIENCE: SUPABASE_AUDIENCE,
    SUPABASE_JWKS_FETCH: jwks.fetchImpl,
    SUPABASE_CLOCK: () => SUPABASE_NOW_MS,
  };
  const request = new Request(`https://gateway.test${path}`, { headers });
  const ctx = createExecutionContext();
  const response = await gateway.fetch(request, bindings, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("gateway read routes", () => {
  it("forwards order list reads with a signed front-desk context", async () => {
    const captured: Request[] = [];
    const response = await requestGateway(
      "/api/orders?limit=2",
      {
        role: "front_desk",
        headers: { "x-hub-id": "hub-2", "x-role": "manager" },
      },
      createLaundryBinding(captured),
    );

    expect(response.status).toBe(200);
    expect(captured).toHaveLength(1);
    const forwarded = captured[0];
    expect(forwarded?.method).toBe("GET");
    expect(forwarded?.url).toBe("https://laundry.internal/api/orders?limit=2");
    expect(forwarded?.headers.get("x-hub-id")).toBeNull();
    expect(forwarded?.headers.get("x-role")).toBeNull();

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
      role: "front_desk",
      tenantId: "tenant-1",
      hubId: "hub-1",
    });
  });

  it("forwards customer detail reads for a manager", async () => {
    const captured: Request[] = [];
    const response = await requestGateway(
      "/api/customers/cust-1",
      { role: "manager" },
      createLaundryBinding(captured),
    );

    expect(response.status).toBe(200);
    expect(captured[0]?.url).toBe(
      "https://laundry.internal/api/customers/cust-1",
    );
  });

  it("denies service roles without view_orders and does not forward", async () => {
    const captured: Request[] = [];
    const response = await requestGateway(
      "/api/orders",
      { role: "service" },
      createLaundryBinding(captured),
    );

    expect(response.status).toBe(403);
    expect(captured).toHaveLength(0);
  });

  it("requires a session", async () => {
    const response = await requestGateway(
      "/api/orders",
      {},
      createLaundryBinding([]),
    );

    expect(response.status).toBe(401);
  });

  it("forwards change-feed and audit-event reads", async () => {
    const captured: Request[] = [];
    const binding = createLaundryBinding(captured);
    const feed = await requestGateway(
      "/api/changes?since=0&limit=5",
      { role: "front_desk" },
      binding,
    );
    const events = await requestGateway(
      "/api/orders/order-1/events?limit=10",
      { role: "front_desk" },
      binding,
    );

    expect(feed.status).toBe(200);
    expect(events.status).toBe(200);
    expect(captured.map((request) => request.url)).toEqual([
      "https://laundry.internal/api/changes?since=0&limit=5",
      "https://laundry.internal/api/orders/order-1/events?limit=10",
    ]);
  });
});
