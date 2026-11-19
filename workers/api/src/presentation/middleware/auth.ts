import type { MiddlewareHandler } from "hono";
import {
  createSupabaseJwtVerifier,
  type SupabaseJwtVerifier,
} from "../../infrastructure/auth/supabase-jwt";
import { seedDatabase } from "../../infrastructure/db/seed";
import type { RoleCode } from "../../shared/constants";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors";
import type { ApiEnv, ApiHonoEnv } from "../types";

function resolveSupabaseVerifier(env: ApiEnv): SupabaseJwtVerifier | null {
  if (env.TEST_SUPABASE_VERIFIER) {
    return env.TEST_SUPABASE_VERIFIER;
  }

  const baseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const jwksUrl =
    env.SUPABASE_JWKS_URL?.trim() ||
    (baseUrl ? `${baseUrl}/auth/v1/.well-known/jwks.json` : "");
  const issuer =
    env.SUPABASE_JWT_ISSUER?.trim() || (baseUrl ? `${baseUrl}/auth/v1` : "");
  const audience = env.SUPABASE_JWT_AUDIENCE?.trim() || "authenticated";

  if (!jwksUrl || !issuer || !audience) {
    return null;
  }

  return createSupabaseJwtVerifier({ jwksUrl, issuer, audience });
}

/**
 * Verifies Supabase Bearer JWTs and resolves staff membership + roles from D1
 * (`users`, `roles`, `user_roles`). Fails closed on missing/invalid JWTs or
 * unassigned/inactive D1 staff memberships.
 */
export const requireAuth: MiddlewareHandler<ApiHonoEnv> = async (c, next) => {
  const verifier = resolveSupabaseVerifier(c.env);
  if (!verifier) {
    throw new UnauthorizedError("Supabase JWT verification is not configured");
  }

  const authHeader = c.req.header("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() ?? "";
  if (!token) {
    throw new UnauthorizedError("Missing Bearer token");
  }

  const verified = await verifier.verify(token);
  if (!verified.ok) {
    throw new UnauthorizedError(`Invalid token: ${verified.reason}`);
  }

  // In local development, ensure base branch & roles are seeded
  if (c.env.ENVIRONMENT === "development") {
    try {
      const defaultBranch = await c.var.container.branches.findDefault();
      if (!defaultBranch) {
        await seedDatabase(c.env.DB);
      }
    } catch {
      // Ignore if unmigrated or already seeded
    }
  }

  let staff = await c.var.container.access.findBySupabaseUserId(
    verified.identity.subject,
  );

  // Match by verified email if not found by Supabase user ID
  if (!staff && verified.identity.email) {
    staff = await c.var.container.access.findByEmail(verified.identity.email);
  }

  // In development mode, auto-provision authenticated user as manager if not present
  if (!staff && c.env.ENVIRONMENT === "development") {
    try {
      const defaultBranch = await c.var.container.branches.findDefault();
      const branchId = defaultBranch?.id ?? 1;
      const email =
        verified.identity.email ??
        `${verified.identity.subject}@freshfold.local`;
      const namePart = email.split("@")[0] || "Staff";
      const fullName = namePart
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      staff = await c.var.container.access.upsertStaffUser({
        branchId,
        supabaseUserId: verified.identity.subject,
        email,
        fullName: fullName || "Development Manager",
        roleCode: "manager",
        nowIso: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Failed to auto-provision development staff member:", e);
    }
  }

  if (!staff) {
    throw new ForbiddenError("No FreshFold staff membership assigned", {
      code: "membership_missing",
    });
  }
  if (!staff.isActive) {
    throw new ForbiddenError("Staff membership is inactive", {
      code: "membership_inactive",
    });
  }
  if (staff.roles.length === 0) {
    throw new ForbiddenError("No active staff role assigned", {
      code: "membership_missing",
    });
  }

  c.set("actor", staff);
  await next();
};

export function requireRoles(
  ...allowed: RoleCode[]
): MiddlewareHandler<ApiHonoEnv> {
  return async (c, next) => {
    const actor = c.var.actor;
    if (!actor) {
      throw new UnauthorizedError("Authentication required");
    }
    const hasRole = actor.roles.some((r) => allowed.includes(r));
    if (!hasRole) {
      throw new ForbiddenError("Insufficient role permissions for this operation");
    }
    await next();
  };
}
