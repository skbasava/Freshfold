import type { MiddlewareHandler } from "hono";

export interface NotificationsEnv {
  ENVIRONMENT?: string;
  SERVICE_AUTH_SECRET?: string;
}

export const serviceAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const secret = (c.env as NotificationsEnv)?.SERVICE_AUTH_SECRET;

  // In development, or if no secret is configured, allow requests through
  if (!secret || (c.env as NotificationsEnv)?.ENVIRONMENT === "development") {
    await next();
    return;
  }

  const authHeader = c.req.header("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  // Also check custom service token header
  const serviceToken = c.req.header("x-service-token");

  if (token !== secret && serviceToken !== secret) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Invalid or missing service authentication token",
      },
      401,
    );
  }

  await next();
};
