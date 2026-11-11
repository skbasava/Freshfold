import { describe, expect, it } from "vitest";
import {
  employeeHubMembershipSchema,
  employeeRecordSchema,
  membershipResolutionRequestSchema,
  membershipResolutionResponseSchema,
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

describe("employee membership contracts", () => {
  it("validates an active employee and membership", () => {
    expect(
      employeeRecordSchema.parse({
        id: "employee-1",
        supabaseSubject: "subject-1",
        email: "manager@example.com",
        displayName: "Maya Manager",
        status: "active",
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toMatchObject({ id: "employee-1", status: "active" });

    expect(
      employeeHubMembershipSchema.parse({
        employeeId: "employee-1",
        tenantId: "tenant-1",
        hubId: "hub-1",
        role: "manager",
        createdAt: 1,
      }),
    ).toMatchObject({ role: "manager" });
  });

  it("requires a verified subject and optional hub hint", () => {
    expect(
      membershipResolutionRequestSchema.parse({ supabaseSubject: "subject-1" }),
    ).toEqual({ supabaseSubject: "subject-1" });
    expect(
      membershipResolutionRequestSchema.parse({
        supabaseSubject: "subject-1",
        hubId: "hub-2",
      }),
    ).toMatchObject({ hubId: "hub-2" });
    expect(
      membershipResolutionRequestSchema.safeParse({ supabaseSubject: "" })
        .success,
    ).toBe(false);
  });

  it("validates a resolved employee context with permissions", () => {
    const response = membershipResolutionResponseSchema.parse({
      employee: {
        id: "employee-1",
        supabaseSubject: "subject-1",
        email: "manager@example.com",
        displayName: "Maya Manager",
        status: "active",
        createdAt: 1,
        updatedAt: 2,
      },
      selected: {
        employeeId: "employee-1",
        tenantId: "tenant-1",
        hubId: "hub-1",
        role: "manager",
        createdAt: 1,
      },
      memberships: [
        {
          employeeId: "employee-1",
          tenantId: "tenant-1",
          hubId: "hub-1",
          role: "manager",
          createdAt: 1,
        },
      ],
      permissions: ["view_orders", "manage_users"],
    });

    expect(response.selected.hubId).toBe("hub-1");
    expect(response.permissions).toContain("view_orders");
  });

  it("defines the auth error codes from the plan", () => {
    for (const code of [
      "invalid_token",
      "expired_session",
      "membership_missing",
      "membership_inactive",
      "cross_tenant_denied",
      "refresh_failed",
    ]) {
      expect(supabaseAuthErrorCodeSchema.parse(code)).toBe(code);
    }
  });
});
