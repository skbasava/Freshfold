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
  const branch = await c.var.container.branches.findById(actor.branchId);
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
        tenantId: "single-branch",
      },
      tenantId: "single-branch",
      tenantEnabled: false,
      hubEnabled: false,
    },
    200,
  );
}

authRoutes.get("/api/me", requireAuth, handleMe);
authRoutes.get("/api/v1/me", requireAuth, handleMe);
