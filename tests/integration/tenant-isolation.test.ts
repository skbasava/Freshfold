import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  SERVICE_HUB_HEADER,
  SERVICE_NAME_HEADER,
  SERVICE_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
  type SignedContext,
} from "../../packages/contracts/src/http";
import {
  createReplayGuard,
  signInternalContext,
} from "../../packages/shared/src/internal-context";
import laundry from "../../workers/laundry/src/index";
import {
  AuthorizationError,
  assertHubAccess,
} from "../../workers/laundry/src/authz";

const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";
const SERVICE_TOKEN = "test-service-token-32-characters-long";

function context(overrides: Partial<SignedContext> = {}): SignedContext {
  const now = Date.now();
  return {
    actorId: "user-desk",
    actorType: "user",
    role: "front_desk",
    tenantId: "tenant-1",
    hubId: "hub-1",
    iat: now,
    exp: now + 60_000,
    nonce: crypto.randomUUID(),
    ...overrides,
  };
}

async function signedHeaders(
  overrides: Partial<SignedContext> = {},
): Promise<Record<string, string>> {
  const signed = await signInternalContext({
    context: context(overrides),
    secret: INTERNAL_CONTEXT_SECRET,
  });

  return {
    [INTERNAL_CONTEXT_HEADER]: signed.encoded,
    [INTERNAL_SIGNATURE_HEADER]: signed.signature,
    [INTERNAL_KEY_ID_HEADER]: signed.keyId,
  };
}

async function requestLaundry(
  path: string,
  headers: Record<string, string>,
): Promise<Response> {
  const request = new Request(`https://laundry.internal${path}`, { headers });
  const ctx = createExecutionContext();
  const response = await laundry.fetch(
    request,
    {
      INTERNAL_CONTEXT_SECRET,
      SERVICE_TOKEN,
    },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

describe("trusted context and tenant isolation", () => {
  it("uses the signed context and ignores spoofed identity headers", async () => {
    const response = await requestLaundry("/internal/whoami", {
      ...(await signedHeaders()),
      "x-role": "manager",
      "x-hub-id": "hub-2",
      "x-tenant-id": "tenant-evil",
      cookie: "laundry_session=forged",
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

  it("rejects unsigned, forged, and cookie-only requests", async () => {
    const unsigned = await requestLaundry("/internal/whoami", {
      "x-role": "manager",
    });
    const forged = await requestLaundry("/internal/whoami", {
      ...(await signedHeaders()),
      [INTERNAL_SIGNATURE_HEADER]: "forged-signature",
    });
    const cookieOnly = await requestLaundry("/internal/whoami", {
      cookie: "laundry_session=forged",
    });

    expect(unsigned.status).toBe(401);
    expect(forged.status).toBe(401);
    expect(cookieOnly.status).toBe(401);
  });

  it("accepts service identity and attributes calendar calls to the system", async () => {
    const response = await requestLaundry("/internal/whoami", {
      [SERVICE_TOKEN_HEADER]: SERVICE_TOKEN,
      [SERVICE_NAME_HEADER]: "calendar",
      [SERVICE_TENANT_HEADER]: "tenant-1",
      [SERVICE_HUB_HEADER]: "hub-1",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      actorId: "system:calendar",
      actorType: "system",
      role: "service",
      tenantId: "tenant-1",
      hubId: "hub-1",
    });
  });

  it("rejects an unknown service or a wrong service token", async () => {
    const unknownService = await requestLaundry("/internal/whoami", {
      [SERVICE_TOKEN_HEADER]: SERVICE_TOKEN,
      [SERVICE_NAME_HEADER]: "attacker",
      [SERVICE_TENANT_HEADER]: "tenant-1",
      [SERVICE_HUB_HEADER]: "hub-1",
    });
    const wrongToken = await requestLaundry("/internal/whoami", {
      [SERVICE_TOKEN_HEADER]: "wrong-service-token-32-characters",
      [SERVICE_NAME_HEADER]: "calendar",
      [SERVICE_TENANT_HEADER]: "tenant-1",
      [SERVICE_HUB_HEADER]: "hub-1",
    });

    expect(unknownService.status).toBe(401);
    expect(wrongToken.status).toBe(401);
  });

  it("denies cross-hub authorization and allows the same hub", async () => {
    const crossHub = await requestLaundry(
      "/internal/authz/check?permission=view_orders&tenantId=tenant-1&hubId=hub-2",
      await signedHeaders(),
    );
    const sameHub = await requestLaundry(
      "/internal/authz/check?permission=view_orders&tenantId=tenant-1&hubId=hub-1",
      await signedHeaders(),
    );

    expect(crossHub.status).toBe(403);
    expect(await crossHub.json()).toEqual({ allowed: false });
    expect(sameHub.status).toBe(200);
    expect(await sameHub.json()).toEqual({ allowed: true });
  });

  it("raises a typed error when a scope does not match", () => {
    const actor = context();

    expect(() =>
      assertHubAccess(actor, { tenantId: "tenant-1", hubId: "hub-2" }),
    ).toThrow(AuthorizationError);
    expect(() =>
      assertHubAccess(actor, { tenantId: "tenant-2", hubId: "hub-1" }),
    ).toThrow(AuthorizationError);
    expect(() =>
      assertHubAccess(actor, { tenantId: "tenant-1", hubId: "hub-1" }),
    ).not.toThrow();
  });
});
