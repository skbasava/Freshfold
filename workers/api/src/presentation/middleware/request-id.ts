import type { MiddlewareHandler } from "hono";
import type { ApiHonoEnv } from "../types";

export const requestContextMiddleware: MiddlewareHandler<ApiHonoEnv> = async (
  c,
  next,
) => {
  const incomingId = c.req.header("x-request-id")?.trim();
  const requestId =
    incomingId && incomingId.length <= 128 ? incomingId : crypto.randomUUID();
  c.set("requestId", requestId);
  c.set("actor", null);
  c.header("x-request-id", requestId);

  const startedAt = Date.now();
  await next();

  // Structured non-PII operational log (Cloudflare Workers observability)
  if (c.env.ENVIRONMENT !== "test") {
    console.log(
      JSON.stringify({
        event: "http_request",
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - startedAt,
      }),
    );
  }
};
