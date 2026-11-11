import { describe, expect, it } from "vitest";
import type { SignedContext } from "../../packages/contracts/src/http";
import {
  createReplayGuard,
  safeEqualStrings,
  signInternalContext,
  verifyInternalContext,
} from "../../packages/shared/src/internal-context";

const SECRET = "test-internal-context-secret-32-bytes";

function context(overrides: Partial<SignedContext> = {}): SignedContext {
  const now = Date.now();
  return {
    actorId: "user-desk",
    actorType: "user",
    role: "front_desk",
    tenantId: "tenant-1",
    hubId: "hub-1",
    iat: now,
    exp: now + 60_000,
    nonce: crypto.randomUUID(),
    ...overrides,
  };
}

describe("signed internal context", () => {
  it("signs and verifies a context", async () => {
    const signed = await signInternalContext({
      context: context(),
      secret: SECRET,
    });
    const verified = await verifyInternalContext({
      encoded: signed.encoded,
      signature: signed.signature,
      keyId: signed.keyId,
      secret: SECRET,
    });

    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.context).toMatchObject({
        actorId: "user-desk",
        role: "front_desk",
        hubId: "hub-1",
      });
    }
  });

  it("rejects tampered, expired, wrong-secret, and future contexts", async () => {
    const signed = await signInternalContext({
      context: context(),
      secret: SECRET,
    });

    const tampered = await verifyInternalContext({
      encoded: `${signed.encoded}tampered`,
      signature: signed.signature,
      keyId: signed.keyId,
      secret: SECRET,
    });
    const wrongSecret = await verifyInternalContext({
      encoded: signed.encoded,
      signature: signed.signature,
      keyId: signed.keyId,
      secret: "another-internal-context-secret-32b",
    });
    const expiredSigned = await signInternalContext({
      context: context({ iat: Date.now() - 120_000, exp: Date.now() - 1 }),
      secret: SECRET,
    });
    const expired = await verifyInternalContext({
      encoded: expiredSigned.encoded,
      signature: expiredSigned.signature,
      keyId: expiredSigned.keyId,
      secret: SECRET,
    });
    const futureSigned = await signInternalContext({
      context: context({ iat: Date.now() + 120_000 }),
      secret: SECRET,
    });
    const future = await verifyInternalContext({
      encoded: futureSigned.encoded,
      signature: futureSigned.signature,
      keyId: futureSigned.keyId,
      secret: SECRET,
    });

    expect(tampered).toEqual({ ok: false, reason: "invalid_signature" });
    expect(wrongSecret).toEqual({ ok: false, reason: "invalid_signature" });
    expect(expired).toEqual({ ok: false, reason: "expired" });
    expect(future).toEqual({ ok: false, reason: "not_yet_valid" });
  });

  it("rejects a replayed nonce within the replay window", async () => {
    const replayGuard = createReplayGuard();
    const signed = await signInternalContext({
      context: context(),
      secret: SECRET,
    });
    const first = await verifyInternalContext({
      encoded: signed.encoded,
      signature: signed.signature,
      keyId: signed.keyId,
      secret: SECRET,
      replayGuard,
    });
    const second = await verifyInternalContext({
      encoded: signed.encoded,
      signature: signed.signature,
      keyId: signed.keyId,
      secret: SECRET,
      replayGuard,
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: "replayed" });
  });

  it("compares secrets without early exit", async () => {
    expect(await safeEqualStrings("same-secret", "same-secret")).toBe(true);
    expect(await safeEqualStrings("same-secret", "other-secret")).toBe(false);
    expect(await safeEqualStrings("short", "longer-value")).toBe(false);
  });
});
