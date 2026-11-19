import { Hono } from "hono";
import { requireAuth, requireRoles } from "../middleware/auth";
import type { ApiHonoEnv } from "../types";

export const healthRoutes = new Hono<ApiHonoEnv>();

healthRoutes.get("/health", (c) => {
  return c.json(c.var.container.healthUseCases.getHealth(), 200);
});

healthRoutes.get("/health/database", async (c) => {
  const dbHealth = await c.var.container.healthUseCases.getDatabaseHealth();
  return c.json(dbHealth, dbHealth.status === "ok" ? 200 : 503);
});

healthRoutes.get(
  "/api/v1/system/storage-health",
  requireAuth,
  requireRoles("super_admin", "admin", "manager"),
  async (c) => {
    const report = await c.var.container.healthUseCases.getStorageHealth();
    return c.json({ data: report }, 200);
  },
);
