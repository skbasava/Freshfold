import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import {
  createLogger,
  safeError,
} from "../../../packages/shared/src/observability";
import { requireSession } from "./auth/session";
import { errorResponse } from "./middleware/errors";
import { forwardToLaundry } from "./middleware/forward";
import { mutationRateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { signedContext } from "./middleware/signed-context";
import changeReadRoutes from "./routes/changes";
import orderReadRoutes from "./routes/orders";
import type { GatewayEnv } from "./types";

const app = new Hono<GatewayEnv>();

app.use("*", requestId);

app.use(
  "/api/*",
  cors({
    origin: (origin) => origin,
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.get("/health", (c) =>
  c.json({ status: "ok" as const, service: "gateway" }),
);

app.get("/api/me", requireSession, (c) => c.json(c.get("session")));

app.route("/api", orderReadRoutes);
app.route("/api", changeReadRoutes);

app.all(
  "/api/*",
  requireSession,
  mutationRateLimit,
  signedContext,
  forwardToLaundry,
);

app.notFound((c) => {
  const redirect = devFrontendRedirect(c);
  if (redirect) {
    return redirect;
  }
  return errorResponse(c, 404, "not_found");
});

app.onError((error, c) => {
  createLogger({
    service: "gateway",
    ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
    requestId: c.get("requestId"),
  }).error("gateway_request_failed", { error: safeError(error) });

  return errorResponse(c, 500, "internal_error");
});

function devFrontendRedirect(c: Context<GatewayEnv>): Response | null {
  const devFrontendUrl = c.env.DEV_FRONTEND_URL;
  if (c.env.ENVIRONMENT !== "development" || !devFrontendUrl) {
    return null;
  }
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    return null;
  }
  const path = c.req.path;
  if (path === "/api" || path.startsWith("/api/") || path === "/health") {
    return null;
  }
  try {
    const current = new URL(c.req.url);
    const target = new URL(`${current.pathname}${current.search}`, devFrontendUrl);
    return c.redirect(target.toString(), 302);
  } catch {
    return null;
  }
}

export default app;
