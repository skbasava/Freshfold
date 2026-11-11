import { base64UrlDecode, base64UrlEncode } from "./tokens";

export const DEFAULT_PASSWORD_ITERATIONS = 600_000;

const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256;
const encoder = new TextEncoder();

export type StoredPassword = {
  hash: string;
  salt: string;
  iterations: number;
};

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    DERIVED_KEY_BITS,
  );

  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  iterations = DEFAULT_PASSWORD_ITERATIONS,
): Promise<StoredPassword> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePassword(password, salt, iterations);

  return {
    hash: base64UrlEncode(hash),
    salt: base64UrlEncode(salt),
    iterations,
  };
}

export async function verifyPassword(
  password: string,
  stored: StoredPassword,
): Promise<boolean> {
  const actual = await derivePassword(
    password,
    base64UrlDecode(stored.salt),
    stored.iterations,
  );
  const expected = base64UrlDecode(stored.hash);

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.subtle.timingSafeEqual(actual, expected);
}
