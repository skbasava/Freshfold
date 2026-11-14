import { Hono } from "hono";
import { REQUEST_ID_HEADER } from "../../../packages/contracts/src/http";
import {
  OBSERVABILITY_EVENTS,
  safeError,
} from "../../../packages/shared/src/observability";
import { requireActor, type LaundryEnv } from "./authz";
import { getLaundryLogger } from "./logging";
import { realtimeHandler } from "./handlers/realtime.handler";
import {
  calendarRouter,
  changeFeedRouter,
  customerRouter,
  deliverySlotRouter,
  internalRouter,
  notificationRouter,
  orderRouter,
  outboxRouter,
  tenantRouter,
  hubRouter,
} from "./routers";
import syncRoutes from "./sync/routes";

const app = new Hono<LaundryEnv>();

// Tracing and request-level observability middleware
app.use("*", async (c, next) => {
  const id = c.req.header(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  c.set("requestId", id);
  c.header(REQUEST_ID_HEADER, id);

  const start = Date.now();
  const path = c.req.path;
  const method = c.req.method;

  if (path !== "/health") {
    const logger = getLaundryLogger(c.env, id, "router");
    logger.debug(OBSERVABILITY_EVENTS.httpRequestReceived, {
      method,
      path,
    });
  }

  await next();

  if (path !== "/health") {
    const durationMs = Date.now() - start;
    const actor = c.get("actor");
    const logger = getLaundryLogger(c.env, id, "router");
    logger.info(OBSERVABILITY_EVENTS.httpRequestCompleted, {
      method,
      path,
      status: c.res.status,
      durationMs,
      ...(actor
        ? {
            actorType: actor.actorType,
            actorId: actor.actorId,
            hubId: actor.hubId,
          }
        : {}),
    });
  }
});

// Health check
app.get("/health", (c) =>
  c.json({ status: "ok" as const, service: "laundry" }),
);

// Mount modular routers
app.route("/api/tenants", tenantRouter);
app.route("/api/hubs", hubRouter);
app.route("/api/customers", customerRouter);
app.route("/api/orders", orderRouter);
app.route("/api/delivery-slots", deliverySlotRouter);
app.route("/api/changes", changeFeedRouter);
app.route("/api/sync", syncRoutes);

// Realtime DO forwarder
app.all("/api/realtime", requireActor, realtimeHandler);

// Internal routers for service-to-service and background operations
app.route("/internal/calendar", calendarRouter);
app.route("/internal/notifications", notificationRouter);
app.route("/internal/outbox", outboxRouter);
app.route("/internal", internalRouter);

// 404 handler
app.notFound((c) => c.json({ error: "not_found" }, 404));

// Error handler
app.onError((error, c) => {
  const logger = getLaundryLogger(c.env, c.get("requestId"), "router");
  logger.error("internal_error", {
    error: safeError(error),
    path: c.req.path,
    method: c.req.method,
  });
  return c.json({ error: "internal_error" }, 500);
});

export { TenantRealtime } from "./durable-objects/tenant-realtime";
export default app;
