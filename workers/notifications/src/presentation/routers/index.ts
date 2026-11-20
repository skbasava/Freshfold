import { Hono } from "hono";
import type { NotificationHandler } from "../handlers/notification.handler";
import type { TenantConfigHandler } from "../handlers/tenant-config.handler";
import { createNotificationRouter } from "./notification.router";
import { createTenantConfigRouter } from "./tenant-config.router";

export interface RouterDependencies {
  notificationHandler: NotificationHandler;
  tenantConfigHandler: TenantConfigHandler;
}

export function createApiRouter(deps: RouterDependencies): Hono {
  const router = new Hono();

  // Observability & Health check
  router.get("/health", (c) =>
    c.json({
      status: "healthy",
      service: "laundry-notifications",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    }),
  );

  // Notification endpoints under /api/v1/notifications and /notifications
  const notificationRouter = createNotificationRouter(deps.notificationHandler);
  router.route("/api/v1/notifications", notificationRouter);
  router.route("/notifications", notificationRouter);

  // Tenant config endpoints under /api/v1/tenants and /tenants
  const tenantConfigRouter = createTenantConfigRouter(deps.tenantConfigHandler);
  router.route("/api/v1/tenants", tenantConfigRouter);
  router.route("/tenants", tenantConfigRouter);

  return router;
}
