const INTERNATIONAL_MIN_DIGITS = 8;
const INTERNATIONAL_MAX_DIGITS = 15;

function international(digits: string): string | null {
  if (!/^\d+$/.test(digits)) {
    return null;
  }
  if (
    digits.length < INTERNATIONAL_MIN_DIGITS ||
    digits.length > INTERNATIONAL_MAX_DIGITS
  ) {
    return null;
  }
  return `+${digits}`;
}

/**
 * Normalizes user-entered phone numbers to an E.164-style string.
 * Returns null when the value contains letters or an unsupported length.
 */
export function normalizePhone(value: string): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/[\s\-().]/g, "");
  if (!cleaned) {
    return null;
  }
  if (cleaned.includes("+") && !cleaned.startsWith("+")) {
    return null;
  }

  if (cleaned.startsWith("+")) {
    return international(cleaned.slice(1));
  }
  if (cleaned.startsWith("00")) {
    return international(cleaned.slice(2));
  }
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }

  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    return `+91${cleaned.slice(1)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+${cleaned}`;
  }

  return international(cleaned);
}

export async function deriveCustomerId(
  hubId: string,
  phoneNormalized: string,
): Promise<string> {
  const input = new TextEncoder().encode(`${hubId}:${phoneNormalized}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `cust_${hex.slice(0, 32)}`;
}
