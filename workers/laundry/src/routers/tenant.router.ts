import { Hono } from "hono";
import { requireActor, type LaundryEnv } from "../authz";
import {
  createTenantHandler,
  deleteTenantHandler,
  getTenantHandler,
  listTenantsHandler,
  updateTenantHandler,
} from "../handlers/tenant.handler";

export const tenantRouter = new Hono<LaundryEnv>();

tenantRouter.post("/", requireActor, createTenantHandler);
tenantRouter.get("/", requireActor, listTenantsHandler);
tenantRouter.get("/:id", requireActor, getTenantHandler);
tenantRouter.patch("/:id", requireActor, updateTenantHandler);
tenantRouter.delete("/:id", requireActor, deleteTenantHandler);

