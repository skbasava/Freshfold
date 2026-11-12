import { describe, expect, it } from "vitest";
import {
  resolveSupabaseAuthorization,
  supabaseAuthErrorCodeSchema,
  supabaseJwtAlgorithmSchema,
  supabaseJwtClaimsSchema,
  supabaseJwtHeaderSchema,
} from "../../packages/contracts/src/supabase-auth";

const validClaims = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "desk@example.com",
  aud: "authenticated",
  iss: "https://project-ref.supabase.co/auth/v1",
  exp: 1_800_000_000,
  iat: 1_799_999_400,
  nbf: 1_799_999_400,
  role: "authenticated",
  session_id: "22222222-2222-4222-8222-222222222222",
  app_metadata: {
    role: "manager",
    tenant_id: "tenant-1",
    hub_id: "hub-1",
    status: "active",
    display_name: "Maya Manager",
  },
};

describe("Supabase JWT contracts", () => {
  it("accepts the supported asymmetric algorithms only", () => {
    expect(supabaseJwtAlgorithmSchema.parse("RS256")).toBe("RS256");
    expect(supabaseJwtAlgorithmSchema.parse("ES256")).toBe("ES256");
    expect(supabaseJwtAlgorithmSchema.safeParse("HS256").success).toBe(false);
    expect(supabaseJwtAlgorithmSchema.safeParse("none").success).toBe(false);

    expect(
      supabaseJwtHeaderSchema.parse({
        alg: "RS256",
        kid: "key-1",
        typ: "JWT",
      }),
    ).toMatchObject({ alg: "RS256", kid: "key-1" });
  });

  it("validates required claims and audience arrays", () => {
    expect(supabaseJwtClaimsSchema.parse(validClaims)).toMatchObject({
      sub: validClaims.sub,
      email: validClaims.email,
      aud: "authenticated",
    });

    expect(
      supabaseJwtClaimsSchema.parse({
        ...validClaims,
        aud: ["authenticated", "other"],
      }).aud,
    ).toEqual(["authenticated", "other"]);

    expect(
      supabaseJwtClaimsSchema.safeParse({ ...validClaims, sub: "" }).success,
    ).toBe(false);
    expect(
      supabaseJwtClaimsSchema.safeParse({ ...validClaims, email: "not-email" })
        .success,
    ).toBe(false);
    expect(
      supabaseJwtClaimsSchema.safeParse({ ...validClaims, exp: 1.5 }).success,
    ).toBe(false);
  });
});

describe("Supabase authorization extraction", () => {
  it("resolves role, tenant, hub, and display name from app_metadata", () => {
    const parsed = supabaseJwtClaimsSchema.parse(validClaims);
    const result = resolveSupabaseAuthorization(parsed);

    expect(result).toEqual({
      ok: true,
      authorization: {
        role: "manager",
        tenantId: "tenant-1",
        hubId: "hub-1",
        status: "active",
        displayName: "Maya Manager",
      },
    });
  });

  it("supports Custom Access Token Auth Hook claims", () => {
    const parsed = supabaseJwtClaimsSchema.parse({
      ...validClaims,
      app_metadata: {},
      staff_role: "front_desk",
      tenant_id: "tenant-2",
      hub_id: "hub-9",
      user_metadata: { full_name: "Riya Sharma" },
    });
    const result = resolveSupabaseAuthorization(parsed);

    expect(result).toEqual({
      ok: true,
      authorization: {
        role: "front_desk",
        tenantId: "tenant-2",
        hubId: "hub-9",
        status: "active",
        displayName: "Riya Sharma",
      },
    });
  });

  it("never trusts user_metadata or built-in top-level role=authenticated for authz", () => {
    const parsed = supabaseJwtClaimsSchema.parse({
      ...validClaims,
      role: "authenticated",
      app_metadata: {},
      user_metadata: {
        role: "manager",
        tenant_id: "tenant-1",
        hub_id: "hub-1",
      },
    });

    expect(resolveSupabaseAuthorization(parsed)).toEqual({
      ok: false,
      status: 403,
      code: "membership_missing",
      reason: "missing_or_invalid_role",
    });
  });

  it("fails closed when role, tenant, or hub is missing or inactive", () => {
    const missingHub = supabaseJwtClaimsSchema.parse({
      ...validClaims,
      app_metadata: { role: "front_desk", tenant_id: "tenant-1" },
    });
    const inactive = supabaseJwtClaimsSchema.parse({
      ...validClaims,
      app_metadata: {
        role: "front_desk",
        tenant_id: "tenant-1",
        hub_id: "hub-1",
        status: "revoked",
      },
    });
    const disabled = supabaseJwtClaimsSchema.parse({
      ...validClaims,
      app_metadata: {
        role: "front_desk",
        tenant_id: "tenant-1",
        hub_id: "hub-1",
        disabled: true,
      },
    });

    expect(resolveSupabaseAuthorization(missingHub)).toMatchObject({
      ok: false,
      status: 403,
      code: "membership_missing",
    });
    expect(resolveSupabaseAuthorization(inactive)).toMatchObject({
      ok: false,
      status: 403,
      code: "membership_inactive",
    });
    expect(resolveSupabaseAuthorization(disabled)).toMatchObject({
      ok: false,
      status: 403,
      code: "membership_inactive",
    });
  });

  it("defines the auth error codes from the plan", () => {
    for (const code of [
      "invalid_token",
      "expired_session",
      "membership_missing",
      "membership_inactive",
      "cross_tenant_denied",
      "refresh_failed",
      "identity_provider_unavailable",
    ]) {
      expect(supabaseAuthErrorCodeSchema.parse(code)).toBe(code);
    }
  });
});
