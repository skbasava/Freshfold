import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../workers/auth/src/password";

describe("password hashing", () => {
  it("stores a salted PBKDF2 hash instead of the password", async () => {
    const stored = await hashPassword("correct horse battery staple");

    expect(stored.hash).not.toContain("correct horse");
    expect(stored.salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(stored.iterations).toBe(600_000);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(
      true,
    );
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("uses a unique salt for each hash", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");

    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });
});
