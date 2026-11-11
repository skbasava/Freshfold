import { Hono, type Context } from "hono";
import { loginRequestSchema } from "../../../packages/contracts/src/auth";
import {
  MAX_JSON_BODY_BYTES,
  REQUEST_ID_HEADER,
} from "../../../packages/contracts/src/http";
import {
  createLogger,
  safeError,
} from "../../../packages/shared/src/observability";
import { localAuthFallbackAllowed, requireSession } from "./auth/session";
import { requireCsrf } from "./middleware/csrf";
import { errorResponse, validationDetails } from "./middleware/errors";
import { forwardToLaundry } from "./middleware/forward";
import {
  loginAccountRateLimit,
  loginIpRateLimit,
  mutationRateLimit,
} from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { signedContext } from "./middleware/signed-context";
import changeReadRoutes from "./routes/changes";
import orderReadRoutes from "./routes/orders";
import type { GatewayEnv } from "./types";

const app = new Hono<GatewayEnv>();

app.use("*", requestId);

app.get("/health", (c) =>
  c.json({ status: "ok" as const, service: "gateway" }),
);

app.post("/auth/login", async (c) => {
  const ipLimited = await loginIpRateLimit(c);
  if (ipLimited) {
    return ipLimited;
  }

  if (!localAuthFallbackAllowed(c.env)) {
    return errorResponse(c, 404, "not_found");
  }

  const text = await c.req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    return errorResponse(c, 413, "payload_too_large");
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse(c, 400, "invalid_request");
  }

  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      c,
      400,
      "invalid_request",
      validationDetails(parsed.error),
    );
  }

  const accountLimited = await loginAccountRateLimit(c, parsed.data.email);
  if (accountLimited) {
    return accountLimited;
  }

  return proxyAuth(c, JSON.stringify(parsed.data));
});

app.all("/auth/*", async (c) => proxyAuth(c));

app.get("/api/me", requireSession, (c) => c.json(c.get("auth")));

app.route("/api", orderReadRoutes);
app.route("/api", changeReadRoutes);

app.all(
  "/api/*",
  requireSession,
  requireCsrf,
  mutationRateLimit,
  signedContext,
  forwardToLaundry,
);

app.notFound((c) => errorResponse(c, 404, "not_found"));

app.onError((error, c) => {
  createLogger({
    service: "gateway",
    ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
    requestId: c.get("requestId"),
  }).error("gateway_request_failed", { error: safeError(error) });

  return errorResponse(c, 500, "internal_error");
});

async function proxyAuth(
  c: Context<GatewayEnv>,
  bodyOverride?: string,
): Promise<Response> {
  if (!localAuthFallbackAllowed(c.env)) {
    return errorResponse(c, 404, "not_found");
  }

  const url = new URL(c.req.url);
  const authPath = url.pathname.replace(/^\/auth/, "") || "/";
  const target = new URL(`https://auth.internal${authPath}${url.search}`);
  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.set(REQUEST_ID_HEADER, c.get("requestId"));

  const method = c.req.method;
  const body =
    bodyOverride ??
    (method !== "GET" && method !== "HEAD"
      ? await c.req.arrayBuffer()
      : undefined);

  if (bodyOverride) {
    headers.set("content-type", "application/json");
  }

  const auth = c.env.AUTH;
  if (!auth) {
    return errorResponse(c, 503, "upstream_unavailable");
  }

  const upstream = await auth.fetch(
    new Request(target, {
      method,
      headers,
      body,
    }),
  );
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set(REQUEST_ID_HEADER, c.get("requestId"));

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export default app;
