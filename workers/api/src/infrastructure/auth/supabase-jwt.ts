import { z } from "zod";

const jwtAlgorithmSchema = z.enum(["RS256", "ES256"]);
type JwtAlgorithm = z.infer<typeof jwtAlgorithmSchema>;

const jwtHeaderSchema = z.object({
  alg: jwtAlgorithmSchema,
  kid: z.string().min(1),
  typ: z.string().optional(),
});

const jwtClaimsSchema = z.object({
  sub: z.string().min(1),
  iss: z.string().min(1),
  aud: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  exp: z.number().int(),
  iat: z.number().int(),
  nbf: z.number().int().optional(),
  email: z.string().email().optional(),
  session_id: z.string().min(1).optional(),
});

export interface VerifiedSupabaseIdentity {
  subject: string;
  email?: string;
  sessionId?: string;
}

export type SupabaseJwtFailureReason =
  | "missing_token"
  | "malformed_token"
  | "unsupported_algorithm"
  | "invalid_claims"
  | "invalid_issuer"
  | "invalid_audience"
  | "expired"
  | "not_yet_valid"
  | "unknown_key"
  | "invalid_signature"
  | "jwks_unavailable";

export type SupabaseJwtVerificationResult =
  | { ok: true; identity: VerifiedSupabaseIdentity }
  | { ok: false; reason: SupabaseJwtFailureReason };

export interface SupabaseJwtVerifier {
  verify(token: string): Promise<SupabaseJwtVerificationResult>;
}

export interface SupabaseJwtVerifierOptions {
  jwksUrl: string;
  issuer: string;
  audience: string;
  algorithms?: JwtAlgorithm[];
  clockSkewSeconds?: number;
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

type JwksKey = JsonWebKey & { kid: string; alg?: string; use?: string };

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const encoder = new TextEncoder();

export function createSupabaseJwtVerifier(
  options: SupabaseJwtVerifierOptions,
): SupabaseJwtVerifier {
  const algorithms = new Set<JwtAlgorithm>(options.algorithms ?? ["RS256", "ES256"]);
  const clockSkewSeconds = options.clockSkewSeconds ?? 60;
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cache: { fetchedAt: number; keys: Map<string, JwksKey> } | null = null;

  async function getSigningKey(
    kid: string,
  ): Promise<{ key: JwksKey } | { reason: SupabaseJwtFailureReason }> {
    const current = now();
    const fresh =
      cache !== null && current - cache.fetchedAt < cacheTtlMs && cache.keys.has(kid);

    if (!fresh) {
      try {
        const res = await fetchImpl(options.jwksUrl, {
          headers: { accept: "application/json" },
          redirect: "manual",
        });
        if (!res.ok || (res.status >= 300 && res.status < 400)) {
          return { reason: "jwks_unavailable" };
        }
        const body = (await res.json()) as { keys?: unknown };
        if (!Array.isArray(body.keys)) {
          return { reason: "jwks_unavailable" };
        }
        const keys = new Map<string, JwksKey>();
        for (const candidate of body.keys) {
          if (
            candidate &&
            typeof candidate === "object" &&
            typeof (candidate as Record<string, unknown>).kid === "string"
          ) {
            const k = candidate as JwksKey;
            keys.set(k.kid, k);
          }
        }
        if (keys.size === 0) {
          return { reason: "jwks_unavailable" };
        }
        cache = { fetchedAt: now(), keys };
      } catch {
        return { reason: "jwks_unavailable" };
      }
    }

    const key = cache?.keys.get(kid);
    return key ? { key } : { reason: "unknown_key" };
  }

  async function verify(token: string): Promise<SupabaseJwtVerificationResult> {
    if (!token) return { ok: false, reason: "missing_token" };
    if (token.length > 16 * 1024) return { ok: false, reason: "malformed_token" };

    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
      return { ok: false, reason: "malformed_token" };
    }

    const headerRaw = decodeJson(parts[0]!);
    const claimsRaw = decodeJson(parts[1]!);
    if (!headerRaw || !claimsRaw) return { ok: false, reason: "malformed_token" };

    const header = jwtHeaderSchema.safeParse(headerRaw);
    if (!header.success) {
      return { ok: false, reason: "unsupported_algorithm" };
    }
    if (!algorithms.has(header.data.alg)) {
      return { ok: false, reason: "unsupported_algorithm" };
    }

    const claims = jwtClaimsSchema.safeParse(claimsRaw);
    if (!claims.success) return { ok: false, reason: "invalid_claims" };
    if (claims.data.iss !== options.issuer) return { ok: false, reason: "invalid_issuer" };

    const audOk = Array.isArray(claims.data.aud)
      ? claims.data.aud.includes(options.audience)
      : claims.data.aud === options.audience;
    if (!audOk) return { ok: false, reason: "invalid_audience" };

    const nowSec = Math.floor(now() / 1000);
    if (nowSec - clockSkewSeconds >= claims.data.exp) {
      return { ok: false, reason: "expired" };
    }
    if (claims.data.nbf !== undefined && nowSec + clockSkewSeconds < claims.data.nbf) {
      return { ok: false, reason: "not_yet_valid" };
    }
    if (nowSec + clockSkewSeconds < claims.data.iat) {
      return { ok: false, reason: "not_yet_valid" };
    }

    const signingKey = await getSigningKey(header.data.kid);
    if ("reason" in signingKey) return { ok: false, reason: signingKey.reason };

    const key = await importKey(signingKey.key, header.data.alg).catch(() => null);
    if (!key) return { ok: false, reason: "invalid_signature" };

    const signature = decodeBase64Url(parts[2]!);
    if (!signature) return { ok: false, reason: "malformed_token" };

    const valid = await crypto.subtle
      .verify(
        header.data.alg === "RS256"
          ? { name: "RSASSA-PKCS1-v1_5" }
          : { name: "ECDSA", hash: "SHA-256" },
        key,
        signature,
        encoder.encode(`${parts[0]}.${parts[1]}`),
      )
      .catch(() => false);

    if (!valid) return { ok: false, reason: "invalid_signature" };

    return {
      ok: true,
      identity: {
        subject: claims.data.sub,
        email: claims.data.email,
        sessionId: claims.data.session_id,
      },
    };
  }

  return { verify };
}

async function importKey(jwk: JwksKey, alg: JwtAlgorithm): Promise<CryptoKey> {
  if (alg === "RS256") {
    return crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

function decodeJson(value: string): unknown {
  const bytes = decodeBase64Url(value);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!value || !BASE64URL_PATTERN.test(value)) return null;
  const base64 =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}
