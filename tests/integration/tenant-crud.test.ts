import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  deleteTenantResponseSchema,
  tenantListResponseSchema,
  tenantSchema,
} from "../../packages/contracts/src/tenants";
import type { SignedContext } from "../../packages/contracts/src/http";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../packages/contracts/src/http";
import { signInternalContext } from "../../packages/shared/src/internal-context";
import laundry from "../../workers/laundry/src/index";
import { clearLaundryData } from "../helpers/laundry-db";

type LaundryTestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as LaundryTestEnv;
const db = testEnv.LAUNDRY_DB;
const INTERNAL_CONTEXT_SECRET = "test-internal-context-secret-32-bytes";

function signedContext(
  overrides: Partial<SignedContext> = {},
): SignedContext {
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

  const ctx = createExecutionContext();
  const response = await laundry.fetch(
    request,
    {
      LAUNDRY_DB: db,
      INTERNAL_CONTEXT_SECRET,
      SERVICE_TOKEN: "test-service-token-32-characters-long",
    },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
});

describe("Tenant Management APIs", () => {
  it("creates a new tenant with a default hub and settings", async () => {
    const payload = {
      name: "FreshFold Koramangala",
      slug: "freshfold-koramangala",
      planTier: "standard",
      contactEmail: "contact@freshfold.in",
      contactPhone: "+919876543210",
      defaultHub: {
        name: "Koramangala Intake Hub",
        code: "KOR",
      },
      settings: {
        currency: "INR",
        timezone: "Asia/Kolkata",
        taxRatePercent: 18,
      },
      metadata: {
        crmSource: "onboarding-web",
      },
    };

    const res = await requestLaundry("/api/tenants", "POST", payload);
    expect(res.status).toBe(201);

    const body = (await res.json()) as { id: string; defaultHubId?: string };
    const parsed = tenantSchema.parse(body);
    expect(parsed.name).toBe("FreshFold Koramangala");
    expect(parsed.slug).toBe("freshfold-koramangala");
    expect(parsed.status).toBe("active");
    expect(parsed.planTier).toBe("standard");
    expect(parsed.settings).toHaveProperty("taxRatePercent", 18);
    expect(parsed.metadata).toHaveProperty("crmSource", "onboarding-web");
    expect(body.defaultHubId).toMatch(/^hub_/);

    // Verify database row for default hub
    const hubRow = await db
      .prepare("SELECT * FROM hubs WHERE tenant_id = ? AND code = 'KOR'")
      .bind(parsed.id)
      .first<{ id: string; name: string; is_active: number }>();

    expect(hubRow).not.toBeNull();
    expect(hubRow?.name).toBe("Koramangala Intake Hub");
    expect(hubRow?.is_active).toBe(1);
  });

  it("retrieves a specific tenant by ID for authorized tenant owner", async () => {
    // Seed tenant
    const createRes = await requestLaundry("/api/tenants", "POST", {
      name: "Acme Laundromat",
      slug: "acme-laundromat",
    });
    const created = (await createRes.json()) as { id: string };

    // Query as the owner of this tenant
    const getRes = await requestLaundry(`/api/tenants/${created.id}`, "GET", undefined, {
      role: "owner",
      tenantId: created.id,
      hubId: "hub-1",
    });

    expect(getRes.status).toBe(200);
    const retrieved = tenantSchema.parse(await getRes.json());
    expect(retrieved.id).toBe(created.id);
    expect(retrieved.name).toBe("Acme Laundromat");
  });

  it("denies cross-tenant retrieval with 404 to avoid resource leaking", async () => {
    // Seed tenant 1
    const createRes = await requestLaundry("/api/tenants", "POST", {
      name: "Tenant One Org",
      slug: "tenant-one-org",
    });
    const tenant1 = (await createRes.json()) as { id: string };

    // Query as tenant 2 owner
    const crossRes = await requestLaundry(`/api/tenants/${tenant1.id}`, "GET", undefined, {
      role: "owner",
      tenantId: "tenant-other-999",
      hubId: "hub-other",
    });

    expect(crossRes.status).toBe(404);
  });

  it("updates tenant configuration and verifies optimistic locking version check", async () => {
    const createRes = await requestLaundry("/api/tenants", "POST", {
      name: "Versioned Laundry",
      slug: "versioned-laundry",
    });
    const created = (await createRes.json()) as { id: string; version: number };
    expect(created.version).toBe(1);

    // Perform successful update
    const updateRes = await requestLaundry(
      `/api/tenants/${created.id}`,
      "PATCH",
      {
        name: "Versioned Laundry Updated",
        contactEmail: "new@laundry.com",
        settings: { notificationsEnabled: true },
        baseVersion: 1,
      },
      {
        role: "owner",
        tenantId: created.id,
      },
    );

    expect(updateRes.status).toBe(200);
    const updated = tenantSchema.parse(await updateRes.json());
    expect(updated.name).toBe("Versioned Laundry Updated");
    expect(updated.contactEmail).toBe("new@laundry.com");
    expect(updated.settings).toHaveProperty("notificationsEnabled", true);
    expect(updated.version).toBe(2);

    // Stale update with old baseVersion should fail with 409 conflict
    const staleRes = await requestLaundry(
      `/api/tenants/${created.id}`,
      "PATCH",
      {
        name: "Conflicting Name",
        baseVersion: 1, // Stale version! Current version is 2
      },
      {
        role: "owner",
        tenantId: created.id,
      },
    );

    expect(staleRes.status).toBe(409);
  });

  it("lists tenants with cursor pagination and status filters", async () => {
    // Create multiple tenants
    await requestLaundry("/api/tenants", "POST", { name: "Tenant A", slug: "tenant-a" });
    await requestLaundry("/api/tenants", "POST", { name: "Tenant B", slug: "tenant-b" });
    await requestLaundry("/api/tenants", "POST", { name: "Tenant C", slug: "tenant-c" });

    // List tenants as super_admin
    const listRes = await requestLaundry("/api/tenants?limit=2", "GET", undefined, {
      role: "super_admin",
    });
    expect(listRes.status).toBe(200);

    const listBody = tenantListResponseSchema.parse(await listRes.json());
    expect(listBody.items.length).toBe(2);
    expect(listBody.nextCursor).not.toBeNull();

    // Fetch next page
    const page2Res = await requestLaundry(
      `/api/tenants?limit=2&cursor=${encodeURIComponent(listBody.nextCursor!)}`,
      "GET",
      undefined,
      { role: "super_admin" },
    );
    expect(page2Res.status).toBe(200);

    const page2Body = tenantListResponseSchema.parse(await page2Res.json());
    expect(page2Body.items.length).toBe(1);
  });

  it("soft-deletes tenant, deactivates associated hubs, and excludes from active list", async () => {
    const createRes = await requestLaundry("/api/tenants", "POST", {
      name: "To Delete Org",
      slug: "to-delete-org",
      defaultHub: { name: "To Delete Hub", code: "DEL" },
    });
    const created = (await createRes.json()) as { id: string };

    // Delete tenant
    const delRes = await requestLaundry(`/api/tenants/${created.id}`, "DELETE", undefined, {
      role: "owner",
      tenantId: created.id,
    });
    expect(delRes.status).toBe(200);

    const delBody = deleteTenantResponseSchema.parse(await delRes.json());
    expect(delBody.status).toBe("deleted");
    expect(delBody.deletedAt).toBeGreaterThan(0);

    // Verify tenant is marked deleted in DB and hubs are deactivated
    const tenantDb = await db
      .prepare("SELECT status, deleted_at FROM tenants WHERE id = ?")
      .bind(created.id)
      .first<{ status: string; deleted_at: number }>();
    expect(tenantDb?.status).toBe("deleted");
    expect(tenantDb?.deleted_at).not.toBeNull();

    const hubDb = await db
      .prepare("SELECT is_active, deleted_at FROM hubs WHERE tenant_id = ?")
      .bind(created.id)
      .first<{ is_active: number; deleted_at: number }>();
    expect(hubDb?.is_active).toBe(0);

    // Querying deleted tenant via GET returns 404
    const getRes = await requestLaundry(`/api/tenants/${created.id}`, "GET", undefined, {
      role: "owner",
      tenantId: created.id,
    });
    expect(getRes.status).toBe(404);
  });
});
