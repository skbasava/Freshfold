import { describe, expect, it } from "vitest";
import {
  internalContextSchema,
  loginRequestSchema,
} from "../../packages/contracts/src/auth";

describe("auth contracts", () => {
  it("normalizes email and drops client-supplied identity fields", () => {
    const parsed = loginRequestSchema.parse({
      email: "  User@Example.COM ",
      password: "secret",
      hubId: "hub-1",
      role: "manager",
      tenantId: "tenant-evil",
      actorId: "someone-else",
    });

    expect(parsed).toEqual({
      email: "user@example.com",
      password: "secret",
      hubId: "hub-1",
    });
  });

  it("rejects an internal context with an unknown role", () => {
    const result = internalContextSchema.safeParse({
      actorId: "user-1",
      actorType: "user",
      role: "owner",
      tenantId: "tenant-1",
      hubId: "hub-1",
      exp: 1_800_000_000_000,
    });

    expect(result.success).toBe(false);
  });
});
