import type { Context, MiddlewareHandler } from "hono";
import type {
  InternalContext,
  SessionResponse,
} from "../../../../packages/contracts/src/auth";
import { SIGNED_CONTEXT_TTL_MS } from "../../../../packages/contracts/src/http";
import {
  resolveSupabaseAuthorization,
  type SupabaseAuthErrorCode,
} from "../../../../packages/contracts/src/supabase-auth";
import {
  createLogger,
  OBSERVABILITY_EVENTS,
  readLogLevelFromEnv,
} from "../../../../packages/shared/src/observability";
import { getSupabaseJwtVerifier } from "./supabase-config";
import type { GatewayEnv } from "../types";

export const requireSession: MiddlewareHandler<GatewayEnv> = async (
  c,
  next,
) => {
  const authorization = c.req.header("authorization");
  if (!authorization) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const token = parseBearerToken(authorization);
  if (!token) {
    return authFailure(c, 401, "invalid_token", "malformed_bearer_header");
  }

  const verifier = getSupabaseJwtVerifier(c.env);
  if (!verifier) {
    return authFailure(
      c,
      503,
      "identity_provider_unavailable",
      "supabase_config_missing",
    );
  }

  const verified = await verifier.verify(token);
  if (!verified.ok) {
    if (verified.reason === "expired") {
      return authFailure(c, 401, "expired_session", verified.reason);
    }
    if (verified.reason === "jwks_unavailable") {
      return authFailure(
        c,
        503,
        "identity_provider_unavailable",
        verified.reason,
      );
    }
    return authFailure(c, 401, "invalid_token", verified.reason);
  }

  const authz = resolveSupabaseAuthorization(verified.claims);
  if (!authz.ok) {
    return authFailure(c, authz.status, authz.code, authz.reason);
  }

  const auth: InternalContext = {
    actorId: verified.identity.subject,
    actorType: "user",
    role: authz.authorization.role,
    tenantId: authz.authorization.tenantId,
    hubId: authz.authorization.hubId,
    exp: Date.now() + SIGNED_CONTEXT_TTL_MS,
  };

  const session: SessionResponse = {
    user: {
      id: verified.identity.subject,
      email: verified.identity.email ?? verified.identity.subject,
      displayName: authz.authorization.displayName,
    },
    hub: {
      id: authz.authorization.hubId,
      tenantId: authz.authorization.tenantId,
    },
    role: authz.authorization.role,
  };

  c.set("auth", auth);
  c.set("session", session);

  createLogger({
    service: "gateway",
    ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
    requestId: c.get("requestId"),
    ...readLogLevelFromEnv(c.env),
  }).info(OBSERVABILITY_EVENTS.authSuccess, {
    actorId: verified.identity.subject,
    role: authz.authorization.role,
    tenantId: authz.authorization.tenantId,
    hubId: authz.authorization.hubId,
  });

  await next();
};

function parseBearerToken(header: string): string | null {
  const match = /^Bearer +([^\s]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function authFailure(
  c: Context<GatewayEnv>,
  status: 401 | 403 | 503,
  code: SupabaseAuthErrorCode,
  reason: string,
): Response {
  createLogger({
    service: "gateway",
    ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
    requestId: c.get("requestId"),
    ...readLogLevelFromEnv(c.env),
  }).warn(OBSERVABILITY_EVENTS.authFailure, {
    status,
    code,
    reason,
  });

  return c.json(
    {
      error: status === 503 ? "identity_provider_unavailable" : code,
      code,
      requestId: c.get("requestId"),
    },
    status,
  );
}
