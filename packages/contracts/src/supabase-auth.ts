import { z } from "zod";
import { roleSchema } from "./auth";

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
    role: z.string().min(1).max(64).optional(),
    session_id: z.string().min(1).max(256).optional(),
  })
  .passthrough();
export type SupabaseJwtClaims = z.infer<typeof supabaseJwtClaimsSchema>;

export const supabaseIdentitySchema = z.object({
  subject: z.string().min(1),
  email: z.string().email().optional(),
  sessionId: z.string().min(1).optional(),
});
export type SupabaseIdentity = z.infer<typeof supabaseIdentitySchema>;

export const employeeStatusSchema = z.enum([
  "active",
  "inactive",
  "revoked",
]);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

export const employeeRecordSchema = z.object({
  id: z.string().min(1),
  supabaseSubject: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  status: employeeStatusSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type EmployeeRecord = z.infer<typeof employeeRecordSchema>;

export const employeeHubMembershipSchema = z.object({
  employeeId: z.string().min(1),
  tenantId: z.string().min(1),
  hubId: z.string().min(1),
  role: roleSchema,
  createdAt: z.number().int().nonnegative(),
});
export type EmployeeHubMembership = z.infer<
  typeof employeeHubMembershipSchema
>;

export const membershipResolutionRequestSchema = z.object({
  supabaseSubject: z.string().min(1).max(256),
  hubId: z.string().trim().min(1).max(128).optional(),
});
export type MembershipResolutionRequest = z.infer<
  typeof membershipResolutionRequestSchema
>;

export const membershipResolutionResponseSchema = z.object({
  employee: employeeRecordSchema,
  selected: employeeHubMembershipSchema,
  memberships: z.array(employeeHubMembershipSchema).min(1),
  permissions: z.array(z.string().min(1)),
});
export type MembershipResolutionResponse = z.infer<
  typeof membershipResolutionResponseSchema
>;

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
