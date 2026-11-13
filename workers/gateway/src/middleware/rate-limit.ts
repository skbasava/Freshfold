import type { Context, MiddlewareHandler } from "hono";
import {
  createLogger,
  readLogLevelFromEnv,
} from "../../../../packages/shared/src/observability";
import type { GatewayEnv, RateLimitBinding } from "../types";
import { errorResponse } from "./errors";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RateLimitResult = "allowed" | "limited" | "unavailable";

export async function checkRateLimit(
  binding: RateLimitBinding | undefined,
  key: string,
  environment: string | undefined,
): Promise<RateLimitResult> {
  if (!binding) {
    return environment === "production" ? "unavailable" : "allowed";
  }

  try {
    const result = await binding.limit({ key });
    return result.success ? "allowed" : "limited";
  } catch {
    return "unavailable";
  }
}

function rateLimitResponse(
  c: Context<GatewayEnv>,
  result: Exclude<RateLimitResult, "allowed">,
): Response {
  if (result === "limited") {
    return errorResponse(c, 429, "rate_limited");
  }

  return errorResponse(c, 503, "rate_limit_unavailable");
}

export const mutationRateLimit: MiddlewareHandler<GatewayEnv> = async (
  c,
  next,
) => {
  if (!MUTATING_METHODS.has(c.req.method)) {
    return next();
  }

  const actor = c.get("auth");
  const result = await checkRateLimit(
    c.env.MUTATION_RATE_LIMITER,
    `mutation:${actor.tenantId}:${actor.hubId}:${actor.actorId}`,
    c.env.ENVIRONMENT,
  );

  if (result !== "allowed") {
    createLogger({
      service: "gateway",
      ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
      requestId: c.get("requestId"),
      ...readLogLevelFromEnv(c.env),
    }).warn("mutation_rate_limited", {
      actorId: actor.actorId,
      hubId: actor.hubId,
      result,
    });
    return rateLimitResponse(c, result);
  }

  return next();
};
