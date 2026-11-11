import { canonicalJsonStringify } from "../../../../packages/shared/src/canonical-json";

export async function hashPayload(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJsonStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
