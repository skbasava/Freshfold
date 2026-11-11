import type { Context, MiddlewareHandler } from "hono";
import type { InternalContext } from "../../../../packages/contracts/src/auth";
import { internalContextSchema } from "../../../../packages/contracts/src/auth";
import { SIGNED_CONTEXT_TTL_MS } from "../../../../packages/contracts/src/http";
import type { SupabaseAuthErrorCode } from "../../../../packages/contracts/src/supabase-auth";
import { getSupabaseJwtVerifier } from "./supabase-config";
import { resolveLaundryMembership } from "./membership";
import type { GatewayBindings, GatewayEnv } from "../types";

export async function verifySession(
  auth: Fetcher,
  cookie: string,
): Promise<InternalContext | null> {
  const response = await auth.fetch(
    new Request("https://auth.internal/internal/session", {
      headers: {
        accept: "application/json",
        cookie,
      },
    }),
  );

  if (!response.ok) {
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const parsed = internalContextSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function localAuthFallbackAllowed(env: GatewayBindings): boolean {
  // The Auth Worker is a local/legacy fallback only. Staging and production
  // must use Supabase so there is never a second production identity source.
  if (env.ENVIRONMENT === "production" || env.ENVIRONMENT === "staging") {
    return false;
  }
  if (env.AUTH_FALLBACK_ENABLED === "false") {
    return false;
  }
  return Boolean(env.AUTH);
}

export const requireSession: MiddlewareHandler<GatewayEnv> = async (
  c,
  next,
) => {
  const authorization = c.req.header("authorization");
  if (authorization !== undefined) {
    return requireSupabaseSession(c, next, authorization);
  }

  if (!localAuthFallbackAllowed(c.env)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  return requireLegacySession(c, next);
};

async function requireLegacySession(
  c: Context<GatewayEnv>,
  next: () => Promise<void>,
): Promise<Response | void> {
  const auth = c.env.AUTH;
  const cookie = c.req.header("cookie");
  if (!auth || !cookie) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const context = await verifySession(auth, cookie);
  if (!context) {
    return c.json({ error: "unauthorized" }, 401);
  }

  c.set("auth", context);
  c.set("authSource", "legacy");
  await next();
}

async function requireSupabaseSession(
  c: Context<GatewayEnv>,
  next: () => Promise<void>,
  authorization: string,
): Promise<Response | void> {
  const token = parseBearerToken(authorization);
  if (!token) {
    return authFailure(c, 401, "invalid_token");
  }

  const verifier = getSupabaseJwtVerifier(c.env);
  if (!verifier) {
    return authFailure(c, 503, "identity_provider_unavailable");
  }

  const verified = await verifier.verify(token);
  if (!verified.ok) {
    if (verified.reason === "expired") {
      return authFailure(c, 401, "expired_session");
    }
    if (verified.reason === "jwks_unavailable") {
      return authFailure(c, 503, "identity_provider_unavailable");
    }
    return authFailure(c, 401, "invalid_token");
  }

  const membership = await resolveLaundryMembership({
    laundry: c.env.LAUNDRY,
    serviceToken: c.env.SERVICE_TOKEN,
    supabaseSubject: verified.identity.subject,
    requestId: c.get("requestId"),
  });

  if (!membership.ok) {
    return authFailure(c, membership.status, membership.code);
  }

  const { employee, selected } = membership.response;
  c.set("auth", {
    actorId: employee.id,
    actorType: "user",
    role: selected.role,
    tenantId: selected.tenantId,
    hubId: selected.hubId,
    exp: Date.now() + SIGNED_CONTEXT_TTL_MS,
  });
  c.set("authSource", "supabase");
  await next();
}

function parseBearerToken(header: string): string | null {
  const match = /^Bearer +([^\s]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function authFailure(
  c: Context<GatewayEnv>,
  status: 401 | 403 | 503,
  code: SupabaseAuthErrorCode,
): Response {
  return c.json(
    {
      error: status === 503 ? "identity_provider_unavailable" : code,
      code,
      requestId: c.get("requestId"),
    },
    status,
  );
}
