import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAppContainer } from "./container";
import { errorHandler } from "./middleware/error-handler";
import { requestContextMiddleware } from "./middleware/request-id";
import { authRoutes } from "./routes/auth.routes";
import { billingRoutes } from "./routes/billing.routes";
import { catalogRoutes } from "./routes/catalog.routes";
import { customerRoutes } from "./routes/customer.routes";
import { deliveryRoutes } from "./routes/delivery.routes";
import { healthRoutes } from "./routes/health.routes";
import { orderRoutes } from "./routes/order.routes";
import { pricingRoutes } from "./routes/pricing.routes";
import type { ApiHonoEnv } from "./types";

export function createApiApp(): Hono<ApiHonoEnv> {
  const app = new Hono<ApiHonoEnv>();

  app.onError(errorHandler);
  app.use("*", requestContextMiddleware);

  // Cross-Origin Resource Sharing (CORS) & preflight handler
  app.use(
    "*",
    cors({
      origin: (origin) => origin || "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
        "idempotency-key", // Need to add only one key instead of three keys in the header
        "Idempotency-Key",
        "x-idempotency-key",
        "x-request-id",
        "x-tenant-id",
        "x-hub-id",
        "x-rc-version",
        "x-payment-signature",
      ],
      exposeHeaders: [
        "x-request-id",
        "x-rc-version",
        "x-tenant-id",
        "x-hub-id",
        "x-idempotent-replayed",
      ],
      maxAge: 86400,
      credentials: true,
    }),
  );

  // Per-request Dependency Injection via Hono context (no global DB instance)
  app.use("*", async (c, next) => {
    c.set("container", createAppContainer(c.env));
    await next();
  });

  // Health & system observability
  app.route("/", healthRoutes);

  // Frontend Supabase Auth session verification (`/api/me`)
  app.route("/", authRoutes);

  // Versioned API routes under /api/v1
  app.route("/api/v1/customers", customerRoutes);
  app.route("/api/v1", catalogRoutes);
  app.route("/api/v1", pricingRoutes);
  app.route("/api/v1/orders", orderRoutes);
  app.route("/api/v1", billingRoutes);
  app.route("/api/v1/billing", billingRoutes);
  app.route("/api/v1", deliveryRoutes);

  // Backward compatibility aliases for dashboard and legacy client callers
  app.route("/api/orders", orderRoutes);
  app.route("/api", pricingRoutes);
  app.get("/api/delivery-slots", async (c) => {
    const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
    const items = [
      { id: `slot-${date}-0900`, label: "09:00 – 11:00", capacity: 10, booked: 0 },
      { id: `slot-${date}-1100`, label: "11:00 – 13:00", capacity: 10, booked: 0 },
      { id: `slot-${date}-1400`, label: "14:00 – 16:00", capacity: 10, booked: 0 },
      { id: `slot-${date}-1600`, label: "16:00 – 18:00", capacity: 10, booked: 0 },
      { id: `slot-${date}-1800`, label: "18:00 – 20:00", capacity: 10, booked: 0 },
    ];
    return c.json({ data: { items }, items }, 200);
  });

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: "not_found",
          message: `Route ${c.req.method} ${c.req.path} not found`,
          requestId: c.get("requestId") ?? "unknown",
        },
      },
      404,
    ),
  );

  return app;
}
