import { describe, it, expect, beforeEach } from "vitest";
import { createTestD1Database } from "../helpers/d1-sqlite";
import laundry from "../../workers/laundry/src/index";
import {
  deleteHubResponseSchema,
  hubListResponseSchema,
  hubSchema,
} from "../../packages/contracts/src/hubs";
import type { SignedContext } from "../../packages/contracts/src/http";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../packages/contracts/src/http";
import { signInternalContext } from "../../packages/shared/src/internal-context";

const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";

function signedContext(overrides: Partial<SignedContext> = {}): SignedContext {
  const now = Date.now();
  return {
    actorId: "super-admin-user",
    actorType: "user",
    role: "super_admin",
    tenantId: "platform-tenant",
    hubId: "platform-hub",
    iat: now,
    exp: now + 60_000,
    nonce: crypto.randomUUID(),
    ...overrides,
  };
}

describe("Hub Management APIs Integration", () => {
  let db: D1Database;
  const now = Date.now();

  async function requestLaundry(
    path: string,
    method = "GET",
    body?: unknown,
    overrides: Partial<SignedContext> = {},
  ): Promise<Response> {
    const signed = await signInternalContext({
      context: signedContext(overrides),
      secret: INTERNAL_CONTEXT_SECRET,
    });

    const headers: Record<string, string> = {
      [INTERNAL_CONTEXT_HEADER]: signed.encoded,
      [INTERNAL_SIGNATURE_HEADER]: signed.signature,
      [INTERNAL_KEY_ID_HEADER]: signed.keyId,
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const request = new Request(`https://laundry.internal${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    return laundry.fetch(
      request,
      {
        LAUNDRY_DB: db,
        INTERNAL_CONTEXT_SECRET,
        SERVICE_TOKEN: "test-service-token-32-characters-long",
      },
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as any,
    );
  }

  beforeEach(async () => {
    db = createTestD1Database();

    // Seed test tenants
    await db
      .prepare(
        `INSERT INTO tenants (
          id, name, slug, status, plan_tier, settings_json, metadata_json,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', 'standard', '{}', '{}', 1, ?, ?)`,
      )
      .bind("tenant-alpha", "Alpha Laundry Corp", "alpha-laundry", now, now)
      .run();

    await db
      .prepare(
        `INSERT INTO tenants (
          id, name, slug, status, plan_tier, settings_json, metadata_json,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', 'standard', '{}', '{}', 1, ?, ?)`,
      )
      .bind("tenant-beta", "Beta Laundry Corp", "beta-laundry", now, now)
      .run();
  });

  it("creates a new hub under a tenant with settings and metadata", async () => {
    const payload = {
      name: "Alpha Bandra Processing Facility",
      code: "BNDR",
      address: "123 Hill Road, Bandra West, Mumbai",
      phone: "+919876500001",
      timezone: "Asia/Kolkata",
      isActive: true,
      settings: {
        dailyCapacityKg: 500,
        expressAvailable: true,
      },
      metadata: {
        facilityType: "processing_plant",
      },
    };

    const res = await requestLaundry(
      "/api/tenants/tenant-alpha/hubs",
      "POST",
      payload,
      { role: "owner", tenantId: "tenant-alpha" },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    const parsed = hubSchema.parse(body);

    expect(parsed.name).toBe("Alpha Bandra Processing Facility");
    expect(parsed.code).toBe("BNDR");
    expect(parsed.tenantId).toBe("tenant-alpha");
    expect(parsed.address).toBe("123 Hill Road, Bandra West, Mumbai");
    expect(parsed.phone).toBe("+919876500001");
    expect(parsed.timezone).toBe("Asia/Kolkata");
    expect(parsed.isActive).toBe(true);
    expect(parsed.version).toBe(1);
    expect(parsed.settings).toHaveProperty("dailyCapacityKg", 500);
    expect(parsed.metadata).toHaveProperty("facilityType", "processing_plant");

    // Verify D1 persistence
    const hubRow = await db
      .prepare("SELECT * FROM hubs WHERE id = ?")
      .bind(parsed.id)
      .first<{ id: string; name: string; is_active: number }>();

    expect(hubRow).not.toBeNull();
    expect(hubRow?.name).toBe("Alpha Bandra Processing Facility");
    expect(hubRow?.is_active).toBe(1);
  });

  it("rejects duplicate hub code within the same tenant with 409", async () => {
    // Create first hub
    const res1 = await requestLaundry(
      "/api/tenants/tenant-alpha/hubs",
      "POST",
      { name: "Alpha Hub 1", code: "MAIN" },
      { role: "owner", tenantId: "tenant-alpha" },
    );
    expect(res1.status).toBe(201);

    // Attempt second hub with same code for tenant-alpha
    const res2 = await requestLaundry(
      "/api/tenants/tenant-alpha/hubs",
      "POST",
      { name: "Alpha Hub Duplicate", code: "MAIN" },
      { role: "owner", tenantId: "tenant-alpha" },
    );
    expect(res2.status).toBe(409);
    const err = (await res2.json()) as { error: string };
    expect(err.error).toBe("CODE_ALREADY_EXISTS");

    // Distinct tenant (tenant-beta) should be allowed to use code "MAIN"
    const resBeta = await requestLaundry(
      "/api/tenants/tenant-beta/hubs",
      "POST",
      { name: "Beta Hub Main", code: "MAIN" },
      { role: "owner", tenantId: "tenant-beta" },
    );
    expect(resBeta.status).toBe(201);
  });

  it("retrieves hub details and denies cross-tenant access with 404", async () => {
    const createRes = await requestLaundry(
      "/api/tenants/tenant-alpha/hubs",
      "POST",
      { name: "Alpha Andheri Hub", code: "ANDH" },
      { role: "owner", tenantId: "tenant-alpha" },
    );
    const created = hubSchema.parse(await createRes.json());

    // Authorized owner retrieval
    const getRes = await requestLaundry(
      `/api/hubs/${created.id}`,
      "GET",
      undefined,
      { role: "owner", tenantId: "tenant-alpha" },
    );
    expect(getRes.status).toBe(200);
    const retrieved = hubSchema.parse(await getRes.json());
    expect(retrieved.id).toBe(created.id);
    expect(retrieved.name).toBe("Alpha Andheri Hub");

    // Cross-tenant access from tenant-beta must return 404 (fail-closed, no resource leakage)
    const crossRes = await requestLaundry(
      `/api/hubs/${created.id}`,
      "GET",
      undefined,
      { role: "owner", tenantId: "tenant-beta" },
    );
    expect(crossRes.status).toBe(404);
  });

  it("updates hub details with optimistic locking check", async () => {
    const createRes = await requestLaundry(
      "/api/tenants/tenant-alpha/hubs",
      "POST",
      { name: "Alpha Juhu Hub", code: "JUHU" },
      { role: "owner", tenantId: "tenant-alpha" },
    );
    const created = hubSchema.parse(await createRes.json());
    expect(created.version).toBe(1);

    // Update with correct baseVersion
    const updateRes = await requestLaundry(
      `/api/hubs/${created.id}`,
      "PATCH",
      {
        name: "Alpha Juhu Flagship Hub",
        address: "Juhu Tara Road",
        settings: { pickupWindowHours: 2 },
        baseVersion: 1,
      },
      { role: "owner", tenantId: "tenant-alpha" },
    );
    expect(updateRes.status).toBe(200);
    const updated = hubSchema.parse(await updateRes.json());
    expect(updated.name).toBe("Alpha Juhu Flagship Hub");
    expect(updated.address).toBe("Juhu Tara Road");
    expect(updated.version).toBe(2);

    // Stale update with old baseVersion should fail with 409
    const staleRes = await requestLaundry(
      `/api/hubs/${created.id}`,
      "PATCH",
      {
        name: "Conflicting Name",
        baseVersion: 1,
      },
      { role: "owner", tenantId: "tenant-alpha" },
    );
    expect(staleRes.status).toBe(409);
    const err = (await staleRes.json()) as { error: string };
    expect(err.error).toBe("VERSION_CONFLICT");
  });

  it("lists hubs for a tenant with cursor pagination and status filters", async () => {
    await requestLaundry(
      "/api/tenants/tenant-alpha/hubs",
      "POST",
      { name: "Hub A", code: "H-A" },
      { role: "owner", tenantId: "tenant-alpha" },
    );
    await requestLaundry(
      "/api/tenants/tenant-alpha/hubs",
      "POST",
      { name: "Hub B", code: "H-B" },
      { role: "owner", tenantId: "tenant-alpha" },
    );
    await requestLaundry(
      "/api/tenants/tenant-alpha/hubs",
      "POST",
      { name: "Hub C", code: "H-C" },
      { role: "owner", tenantId: "tenant-alpha" },
    );

    const listRes = await requestLaundry(
      "/api/tenants/tenant-alpha/hubs?limit=2",
      "GET",
      undefined,
      { role: "owner", tenantId: "tenant-alpha" },
    );
    expect(listRes.status).toBe(200);

    const listBody = hubListResponseSchema.parse(await listRes.json());
    expect(listBody.items.length).toBe(2);
    expect(listBody.nextCursor).not.toBeNull();

    const page2Res = await requestLaundry(
      `/api/tenants/tenant-alpha/hubs?limit=2&cursor=${encodeURIComponent(listBody.nextCursor!)}`,
      "GET",
      undefined,
      { role: "owner", tenantId: "tenant-alpha" },
    );
    expect(page2Res.status).toBe(200);
    const page2Body = hubListResponseSchema.parse(await page2Res.json());
    expect(page2Body.items.length).toBe(1);
  });

  it("soft-deletes a hub and excludes it from future queries", async () => {
    const createRes = await requestLaundry(
      "/api/tenants/tenant-alpha/hubs",
      "POST",
      { name: "To Delete Hub", code: "DEL-H" },
      { role: "owner", tenantId: "tenant-alpha" },
    );
    const created = hubSchema.parse(await createRes.json());

    const delRes = await requestLaundry(
      `/api/hubs/${created.id}`,
      "DELETE",
      undefined,
      { role: "owner", tenantId: "tenant-alpha" },
    );
    expect(delRes.status).toBe(200);
    const delBody = deleteHubResponseSchema.parse(await delRes.json());
    expect(delBody.status).toBe("deleted");
    expect(delBody.deletedAt).toBeGreaterThan(0);

    // Database verification: is_active=0, deleted_at is set
    const hubDb = await db
      .prepare("SELECT is_active, deleted_at FROM hubs WHERE id = ?")
      .bind(created.id)
      .first<{ is_active: number; deleted_at: number }>();
    expect(hubDb?.is_active).toBe(0);
    expect(hubDb?.deleted_at).not.toBeNull();

    // Subsequent retrieval returns 404
    const getRes = await requestLaundry(
      `/api/hubs/${created.id}`,
      "GET",
      undefined,
      { role: "owner", tenantId: "tenant-alpha" },
    );
    expect(getRes.status).toBe(404);
  });
});

