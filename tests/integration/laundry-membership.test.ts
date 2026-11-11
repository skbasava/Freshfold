import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { membershipResolutionResponseSchema } from "../../packages/contracts/src/supabase-auth";
import laundry from "../../workers/laundry/src/index";

type LaundryTestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as LaundryTestEnv;
const db = testEnv.LAUNDRY_DB;
const SERVICE_TOKEN = "test-service-token-32-characters-long";

async function requestMembership(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Response> {
  const request = new Request(
    "https://laundry.internal/internal/auth/resolve-membership",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
  const ctx = createExecutionContext();
  const response = await laundry.fetch(
    request,
    { LAUNDRY_DB: db, SERVICE_TOKEN },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

function serviceHeaders(
  name = "gateway",
  token = SERVICE_TOKEN,
): Record<string, string> {
  return {
    "x-service-token": token,
    "x-service-name": name,
  };
}

async function seedTenantGraph(): Promise<void> {
  await db
    .prepare("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)")
    .bind("tenant-1", "Tenant One", 1)
    .run();
  await db
    .prepare("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)")
    .bind("tenant-2", "Tenant Two", 1)
    .run();

  for (const [id, tenantId] of [
    ["hub-1", "tenant-1"],
    ["hub-2", "tenant-1"],
    ["hub-3", "tenant-2"],
  ] as const) {
    await db
      .prepare(
        "INSERT INTO hubs (id, tenant_id, name, timezone, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(id, tenantId, id, "Asia/Kolkata", 1)
      .run();
  }
}

async function seedEmployee(input: {
  id: string;
  subject: string;
  status?: "active" | "inactive" | "revoked";
  memberships: Array<{
    tenantId: string;
    hubId: string;
    role: "front_desk" | "manager" | "service";
    createdAt?: number;
  }>;
}): Promise<void> {
  await db
    .prepare(
      `INSERT INTO employees
        (id, supabase_subject, email, display_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.subject,
      `${input.id}@example.com`,
      `Employee ${input.id}`,
      input.status ?? "active",
      1,
      1,
    )
    .run();

  for (const membership of input.memberships) {
    await db
      .prepare(
        `INSERT INTO employee_hub_memberships
          (employee_id, tenant_id, hub_id, role, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        membership.tenantId,
        membership.hubId,
        membership.role,
        membership.createdAt ?? 1,
      )
      .run();
  }
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await db.exec(
    "DELETE FROM employee_hub_memberships; DELETE FROM employees; DELETE FROM hubs; DELETE FROM tenants;",
  );
  await seedTenantGraph();
});

describe("Laundry membership resolution", () => {
  it("resolves an active front-desk employee with server-owned permissions", async () => {
    await seedEmployee({
      id: "desk-1",
      subject: "subject-desk",
      memberships: [
        { tenantId: "tenant-1", hubId: "hub-1", role: "front_desk" },
      ],
    });

    const response = await requestMembership(
      { supabaseSubject: "subject-desk" },
      serviceHeaders(),
    );

    expect(response.status).toBe(200);
    const body = membershipResolutionResponseSchema.parse(
      await response.json(),
    );
    expect(body.employee).toMatchObject({
      id: "desk-1",
      supabaseSubject: "subject-desk",
      status: "active",
    });
    expect(body.selected).toMatchObject({
      tenantId: "tenant-1",
      hubId: "hub-1",
      role: "front_desk",
    });
    expect(body.permissions).toContain("view_orders");
    expect(body.permissions).toContain("create_order");
    expect(body.permissions).not.toContain("manage_users");
    expect(body.permissions).not.toContain("reschedule_order");
  });

  it("returns the manager permission matrix", async () => {
    await seedEmployee({
      id: "manager-1",
      subject: "subject-manager",
      memberships: [
        { tenantId: "tenant-1", hubId: "hub-1", role: "manager" },
      ],
    });

    const response = await requestMembership(
      { supabaseSubject: "subject-manager" },
      serviceHeaders(),
    );

    expect(response.status).toBe(200);
    const body = membershipResolutionResponseSchema.parse(
      await response.json(),
    );
    expect(body.permissions).toEqual(
      expect.arrayContaining([
        "manage_users",
        "reschedule_order",
        "cancel_order",
        "manage_calendar",
      ]),
    );
  });

  it("requires an explicit hub hint to select between multiple memberships", async () => {
    await seedEmployee({
      id: "multi-1",
      subject: "subject-multi",
      memberships: [
        {
          tenantId: "tenant-1",
          hubId: "hub-1",
          role: "front_desk",
          createdAt: 1,
        },
        {
          tenantId: "tenant-1",
          hubId: "hub-2",
          role: "manager",
          createdAt: 2,
        },
      ],
    });

    const first = await requestMembership(
      { supabaseSubject: "subject-multi" },
      serviceHeaders(),
    );
    const second = await requestMembership(
      { supabaseSubject: "subject-multi", hubId: "hub-2" },
      serviceHeaders(),
    );

    expect(first.status).toBe(200);
    expect(
      membershipResolutionResponseSchema.parse(await first.json()).selected,
    ).toMatchObject({
      hubId: "hub-1",
      role: "front_desk",
    });
    expect(second.status).toBe(200);
    expect(
      membershipResolutionResponseSchema.parse(await second.json()).selected,
    ).toMatchObject({
      hubId: "hub-2",
      role: "manager",
    });
  });

  it("denies a requested hub the employee does not belong to", async () => {
    await seedEmployee({
      id: "desk-1",
      subject: "subject-desk",
      memberships: [
        { tenantId: "tenant-1", hubId: "hub-1", role: "front_desk" },
      ],
    });

    const response = await requestMembership(
      { supabaseSubject: "subject-desk", hubId: "hub-3" },
      serviceHeaders(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "cross_tenant_denied",
    });
  });

  it("rejects unknown and inactive or revoked employees", async () => {
    await seedEmployee({
      id: "inactive-1",
      subject: "subject-inactive",
      status: "inactive",
      memberships: [
        { tenantId: "tenant-1", hubId: "hub-1", role: "front_desk" },
      ],
    });
    await seedEmployee({
      id: "revoked-1",
      subject: "subject-revoked",
      status: "revoked",
      memberships: [
        { tenantId: "tenant-1", hubId: "hub-1", role: "manager" },
      ],
    });

    const missing = await requestMembership(
      { supabaseSubject: "subject-missing" },
      serviceHeaders(),
    );
    const inactive = await requestMembership(
      { supabaseSubject: "subject-inactive" },
      serviceHeaders(),
    );
    const revoked = await requestMembership(
      { supabaseSubject: "subject-revoked" },
      serviceHeaders(),
    );

    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({
      error: "membership_missing",
    });
    expect(inactive.status).toBe(403);
    expect(await inactive.json()).toMatchObject({
      error: "membership_inactive",
    });
    expect(revoked.status).toBe(403);
    expect(await revoked.json()).toMatchObject({
      error: "membership_inactive",
    });
  });

  it("requires the trusted gateway service credential and service name", async () => {
    await seedEmployee({
      id: "desk-1",
      subject: "subject-desk",
      memberships: [
        { tenantId: "tenant-1", hubId: "hub-1", role: "front_desk" },
      ],
    });

    const missing = await requestMembership({ supabaseSubject: "subject-desk" });
    const wrongToken = await requestMembership(
      { supabaseSubject: "subject-desk" },
      serviceHeaders("gateway", "wrong-service-token-32-characters"),
    );
    const wrongService = await requestMembership(
      { supabaseSubject: "subject-desk" },
      serviceHeaders("calendar"),
    );

    expect(missing.status).toBe(401);
    expect(wrongToken.status).toBe(401);
    expect(wrongService.status).toBe(401);
  });

  it("rejects invalid request bodies", async () => {
    const response = await requestMembership({}, serviceHeaders());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });
});
