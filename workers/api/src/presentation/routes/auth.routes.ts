import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import type { ApiHonoEnv } from "../types";

export const authRoutes = new Hono<ApiHonoEnv>();

/**
 * Staff session verification endpoint compatible with the FreshFold frontend
 * Supabase AuthContext (`GET /api/me` and versioned alias `GET /api/v1/me`).
 */
async function handleMe(c: import("hono").Context<ApiHonoEnv>) {
  const actor = c.var.actor!;
  const tenant = await c.var.container.tenants.findById(actor.tenantId);
  const branch = await c.var.container.branches.findById(actor.branchId);
  const availableBranches = await c.var.container.branches.findByTenantId(actor.tenantId);
  const primaryRole = actor.roles[0] ?? "front_desk";

  c.header("x-rc-version", "1.0.0");
  return c.json(
    {
      user: {
        id: String(actor.id),
        email: actor.email,
        displayName: actor.fullName,
      },
      role: primaryRole,
      roles: actor.roles,
      hub: {
        id: branch?.code ?? "MAIN",
        name: branch?.name ?? "FreshFold Main Branch",
        code: branch?.code ?? "MAIN",
        tenantId: String(tenant?.id ?? actor.tenantId ?? 1),
      },
      tenant: tenant
        ? {
            id: String(tenant.id),
            name: tenant.name,
            code: tenant.code,
          }
        : {
            id: "1",
            name: "FreshFold India",
            code: "TENANT-001",
          },
      availableHubs: (availableBranches.length > 0 ? availableBranches : (branch ? [branch] : [])).map((b) => ({
        id: b.code,
        numericId: b.id,
        name: b.name,
        code: b.code,
        stateCode: b.stateCode,
        isDefault: b.isDefault,
      })),
      tenantId: String(tenant?.id ?? actor.tenantId ?? 1),
      tenantEnabled: true,
      hubEnabled: true,
    },
    200,
  );
}

authRoutes.get("/api/me", requireAuth, handleMe);
authRoutes.get("/api/v1/me", requireAuth, handleMe);
