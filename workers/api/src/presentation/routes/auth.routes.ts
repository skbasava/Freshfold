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
  const primaryRole = actor.roles[0] ?? "front_desk";
  const tenantIdStr = String(actor.tenantId ?? 1);
  const branchId = actor.branchId ?? 1;

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
        id: "MAIN",
        name: "FreshFold Main Branch",
        code: "MAIN",
        tenantId: tenantIdStr,
      },
      tenant: {
        id: tenantIdStr,
        name: "FreshFold India",
        code: "TENANT-001",
      },
      availableHubs: [
        {
          id: "MAIN",
          numericId: branchId,
          name: "FreshFold Main Branch",
          code: "MAIN",
          stateCode: "29",
          isDefault: true,
        },
      ],
      tenantId: tenantIdStr,
      tenantEnabled: true,
      hubEnabled: true,
    },
    200,
  );
}

authRoutes.get("/api/me", requireAuth, handleMe);
authRoutes.get("/api/v1/me", requireAuth, handleMe);
