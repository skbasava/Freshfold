import { describe, expect, it } from "vitest";
import {
  generateToken,
  hashToken,
  timingSafeStringEqual,
} from "../../workers/auth/src/tokens";

describe("auth tokens", () => {
  it("generates URL-safe tokens with stable SHA-256 hashes", async () => {
    const token = generateToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashToken(token)).toBe(await hashToken(token));
    expect(await hashToken(generateToken())).not.toBe(await hashToken(token));
  });

  it("compares strings without leaking a prefix match", () => {
    expect(timingSafeStringEqual("same", "same")).toBe(true);
    expect(timingSafeStringEqual("same", "sane")).toBe(false);
    expect(timingSafeStringEqual("short", "longer")).toBe(false);
  });
});
