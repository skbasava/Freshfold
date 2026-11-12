import { z } from "zod";
import { roleSchema, type Role } from "./auth";

export const supabaseJwtAlgorithmSchema = z.enum(["RS256", "ES256"]);
export type SupabaseJwtAlgorithm = z.infer<
  typeof supabaseJwtAlgorithmSchema
>;

export const supabaseJwtHeaderSchema = z
  .object({
    alg: supabaseJwtAlgorithmSchema,
    kid: z.string().min(1).max(256),
    typ: z.literal("JWT").optional(),
  })
  .passthrough();
export type SupabaseJwtHeader = z.infer<typeof supabaseJwtHeaderSchema>;

const audienceSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

export const supabaseJwtClaimsSchema = z
  .object({
    sub: z.string().min(1).max(256),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    aud: audienceSchema,
    iss: z.string().min(1),
    exp: z.number().int().positive(),
    iat: z.number().int().nonnegative(),
    nbf: z.number().int().nonnegative().optional(),
    // Supabase built-in top-level role (typically "authenticated"); never used as FreshFold RBAC role.
    role: z.string().min(1).max(64).optional(),
    session_id: z.string().min(1).max(256).optional(),
    app_metadata: z.record(z.string(), z.unknown()).optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export type SupabaseJwtClaims = z.infer<typeof supabaseJwtClaimsSchema>;

export const supabaseIdentitySchema = z.object({
  subject: z.string().min(1),
  email: z.string().email().optional(),
  sessionId: z.string().min(1).optional(),
});
export type SupabaseIdentity = z.infer<typeof supabaseIdentitySchema>;

export const staffStatusSchema = z.enum(["active", "inactive", "revoked"]);
export type StaffStatus = z.infer<typeof staffStatusSchema>;

export const supabaseAuthorizationSchema = z.object({
  role: roleSchema,
  tenantId: z.string().trim().min(1).max(128),
  hubId: z.string().trim().min(1).max(128),
  status: z.literal("active"),
  displayName: z.string().trim().min(1).max(256),
});
export type SupabaseAuthorization = z.infer<typeof supabaseAuthorizationSchema>;

export const supabaseAuthErrorCodeSchema = z.enum([
  "invalid_token",
  "expired_session",
  "membership_missing",
  "membership_inactive",
  "cross_tenant_denied",
  "refresh_failed",
  "identity_provider_unavailable",
]);
export type SupabaseAuthErrorCode = z.infer<
  typeof supabaseAuthErrorCodeSchema
>;

export type SupabaseAuthorizationResult =
  | {
      ok: true;
      authorization: SupabaseAuthorization;
    }
  | {
      ok: false;
      status: 403;
      code: "membership_missing" | "membership_inactive";
      reason:
        | "inactive_status"
        | "missing_or_invalid_role"
        | "missing_tenant_or_hub";
    };

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function singleHubFromList(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length !== 1) {
    return undefined;
  }
  return nonEmptyString(value[0]);
}

/**
 * Extracts FreshFold authorization strictly from server-controlled claims in a
 * verified Supabase JWT (`app_metadata` or Custom Access Token Auth Hook claims).
 *
 * Security boundary:
 * - Never reads `user_metadata` for `role`, `tenantId`, `hubId`, or `status`
 *   because Supabase allows signed-in users to edit `user_metadata`.
 * - Never accepts top-level `claims.role` ("authenticated" / "anon") as a
 *   FreshFold RBAC role.
 */
export function resolveSupabaseAuthorization(
  claims: SupabaseJwtClaims,
): SupabaseAuthorizationResult {
  const root = claims as Record<string, unknown>;
  const appMeta = asRecord(claims.app_metadata);
  const userMeta = asRecord(claims.user_metadata);

  if (appMeta.disabled === true || appMeta.revoked === true) {
    return {
      ok: false,
      status: 403,
      code: "membership_inactive",
      reason: "inactive_status",
    };
  }

  const rawStatus =
    nonEmptyString(root.staff_status) ??
    nonEmptyString(root.account_status) ??
    nonEmptyString(appMeta.status);

  if (rawStatus !== undefined) {
    const parsedStatus = staffStatusSchema.safeParse(rawStatus);
    if (!parsedStatus.success || parsedStatus.data !== "active") {
      return {
        ok: false,
        status: 403,
        code: "membership_inactive",
        reason: "inactive_status",
      };
    }
  }

  const rawRole =
    nonEmptyString(root.app_role) ??
    nonEmptyString(root.staff_role) ??
    nonEmptyString(appMeta.role);
  const parsedRole = roleSchema.safeParse(rawRole);
  if (!parsedRole.success) {
    return {
      ok: false,
      status: 403,
      code: "membership_missing",
      reason: "missing_or_invalid_role",
    };
  }

  const tenantId =
    nonEmptyString(root.tenant_id) ??
    nonEmptyString(root.tenantId) ??
    nonEmptyString(appMeta.tenant_id) ??
    nonEmptyString(appMeta.tenantId);

  const hubId =
    nonEmptyString(root.hub_id) ??
    nonEmptyString(root.hubId) ??
    nonEmptyString(appMeta.hub_id) ??
    nonEmptyString(appMeta.hubId) ??
    singleHubFromList(appMeta.hub_ids);

  if (!tenantId || !hubId) {
    return {
      ok: false,
      status: 403,
      code: "membership_missing",
      reason: "missing_tenant_or_hub",
    };
  }

  const displayName =
    nonEmptyString(root.display_name) ??
    nonEmptyString(appMeta.display_name) ??
    nonEmptyString(appMeta.displayName) ??
    nonEmptyString(userMeta.full_name) ??
    nonEmptyString(userMeta.name) ??
    claims.email ??
    claims.sub;

  const parsed = supabaseAuthorizationSchema.safeParse({
    role: parsedRole.data satisfies Role,
    tenantId,
    hubId,
    status: "active" as const,
    displayName,
  });

  if (!parsed.success) {
    return {
      ok: false,
      status: 403,
      code: "membership_missing",
      reason: "missing_tenant_or_hub",
    };
  }

  return {
    ok: true,
    authorization: parsed.data,
  };
}
