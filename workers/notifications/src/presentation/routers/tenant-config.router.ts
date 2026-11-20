import { Hono } from "hono";
import type { TenantConfigHandler } from "../handlers/tenant-config.handler";

export function createTenantConfigRouter(handler: TenantConfigHandler): Hono {
  const router = new Hono();

  router.get("/:tenantId/config", handler.getConfig);
  router.put("/:tenantId/config", handler.updateConfig);

  return router;
}
