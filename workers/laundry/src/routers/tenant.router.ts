import { Hono } from "hono";
import { requireActor, type LaundryEnv } from "../authz";
import {
  createHubHandler,
  deleteHubHandler,
  getHubHandler,
  listHubsHandler,
  updateHubHandler,
} from "../handlers/hub.handler";
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

// Nested Hub management routes
tenantRouter.post("/:tenantId/hubs", requireActor, createHubHandler);
tenantRouter.get("/:tenantId/hubs", requireActor, listHubsHandler);
tenantRouter.get("/:tenantId/hubs/:id", requireActor, getHubHandler);
tenantRouter.patch("/:tenantId/hubs/:id", requireActor, updateHubHandler);
tenantRouter.delete("/:tenantId/hubs/:id", requireActor, deleteHubHandler);


