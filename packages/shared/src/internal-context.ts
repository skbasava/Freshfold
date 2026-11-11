import {
  signedContextSchema,
  type SignedContext,
} from "../../contracts/src/http";

const encoder = new TextEncoder();

export type ReplayGuard = {
  accept(nonce: string, expiresAt: number, now?: number): boolean;
};

export type VerifyInternalContextResult =
  | { ok: true; context: SignedContext }
  | {
      ok: false;
      reason:
        | "missing"
        | "malformed"
        | "invalid_signature"
        | "expired"
        | "not_yet_valid"
        | "replayed";
    };

type SignInput = {
  context: SignedContext;
  secret: string;
  keyId?: string;
};

type VerifyInput = {
  encoded: string | null;
  signature: string | null;
  keyId: string | null;
  secret: string;
  now?: number;
  replayGuard?: ReplayGuard;
};

export function createReplayGuard(ttlMs = 5 * 60 * 1000): ReplayGuard {
  const seen = new Map<string, number>();

  return {
    accept(nonce, expiresAt, now = Date.now()) {
      for (const [value, expiry] of seen) {
        if (expiry <= now) {
          seen.delete(value);
        }
      }

      if (seen.has(nonce)) {
        return false;
      }

      seen.set(nonce, Math.max(expiresAt, now + ttlMs));
      return true;
    },
  };
}

export async function signInternalContext({
  context,
  secret,
  keyId = "v1",
}: SignInput): Promise<{
  encoded: string;
  signature: string;
  keyId: string;
}> {
  assertSecret(secret);
  const encoded = base64UrlEncode(encoder.encode(JSON.stringify(context)));
  const signature = await sign(secret, `${keyId}.${encoded}`);

  return { encoded, signature, keyId };
}

export async function verifyInternalContext({
  encoded,
  signature,
  keyId,
  secret,
  now = Date.now(),
  replayGuard,
}: VerifyInput): Promise<VerifyInternalContextResult> {
  if (!encoded || !signature) {
    return { ok: false, reason: "missing" };
  }

  if (!secret) {
    return { ok: false, reason: "invalid_signature" };
  }

  let expected: string;
  try {
    expected = await sign(secret, `${keyId ?? "v1"}.${encoded}`);
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }

  if (!safeEqual(signature, expected)) {
    return { ok: false, reason: "invalid_signature" };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const parsed = signedContextSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, reason: "malformed" };
  }

  if (parsed.data.iat > now + 60_000) {
    return { ok: false, reason: "not_yet_valid" };
  }

  if (parsed.data.exp <= now) {
    return { ok: false, reason: "expired" };
  }

  if (replayGuard && !replayGuard.accept(parsed.data.nonce, parsed.data.exp, now)) {
    return { ok: false, reason: "replayed" };
  }

  return { ok: true, context: parsed.data };
}

export async function safeEqualStrings(
  left: string,
  right: string,
): Promise<boolean> {
  return safeEqual(left, right);
}

async function sign(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
}

function assertSecret(secret: string): void {
  if (secret.length < 32) {
    throw new Error("INTERNAL_CONTEXT_SECRET must be at least 32 characters");
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
