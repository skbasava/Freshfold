import type { PaymentProviderPort } from "../../domain/repositories/storage.port";

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function computeHmacSha256Hex(
  payload: string,
  secret: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class HmacPaymentProviderAdapter implements PaymentProviderPort {
  async verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | undefined,
    secret: string,
  ): Promise<boolean> {
    if (!signatureHeader || !secret) {
      return false;
    }
    const provided = hexToBytes(signatureHeader);
    if (!provided) {
      return false;
    }
    const expectedHex = await computeHmacSha256Hex(rawBody, secret);
    const expected = hexToBytes(expectedHex);
    if (!expected) {
      return false;
    }
    return timingSafeEqual(provided, expected);
  }
}
