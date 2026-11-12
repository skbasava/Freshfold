import {
  supabaseIdentitySchema,
  supabaseJwtAlgorithmSchema,
  supabaseJwtClaimsSchema,
  supabaseJwtHeaderSchema,
  type SupabaseIdentity,
  type SupabaseJwtAlgorithm,
  type SupabaseJwtClaims,
} from "../../../../packages/contracts/src/supabase-auth";

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
  | {
      ok: true;
      identity: SupabaseIdentity;
      claims: SupabaseJwtClaims;
    }
  | { ok: false; reason: SupabaseJwtFailureReason };

export type SupabaseJwksFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type SupabaseJwksErrorDetail = {
  reason: "http_error" | "invalid_payload" | "empty_keys" | "fetch_threw";
  status?: number;
  error?: unknown;
};

export type SupabaseJwtVerifierOptions = {
  jwksUrl: string;
  issuer: string;
  audience: string;
  algorithms?: SupabaseJwtAlgorithm[];
  clockSkewSeconds?: number;
  cacheTtlMs?: number;
  fetchImpl?: SupabaseJwksFetch;
  now?: () => number;
  onJwksError?: (detail: SupabaseJwksErrorDetail) => void;
};

export type SupabaseJwtVerifier = {
  verify(token: string): Promise<SupabaseJwtVerificationResult>;
};

const DEFAULT_ALGORITHMS: SupabaseJwtAlgorithm[] = ["RS256", "ES256"];
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_LENGTH = 16 * 1024;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type JwksKey = JsonWebKey & { kid: string; alg?: string; use?: string };

type KeyCache = {
  fetchedAt: number;
  keys: Map<string, JwksKey>;
};

const encoder = new TextEncoder();

export function createSupabaseJwtVerifier(
  options: SupabaseJwtVerifierOptions,
): SupabaseJwtVerifier {
  if (!options.jwksUrl || !options.issuer || !options.audience) {
    throw new Error("Supabase JWT verifier requires JWKS URL, issuer and audience");
  }

  const algorithms = new Set(
    (options.algorithms ?? DEFAULT_ALGORITHMS).filter(
      (algorithm) => supabaseJwtAlgorithmSchema.safeParse(algorithm).success,
    ),
  );
  const clockSkewSeconds =
    options.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cache: KeyCache | null = null;

  async function fetchKeys(): Promise<KeyCache | null> {
    try {
      const response = await fetchImpl(options.jwksUrl, {
        headers: { accept: "application/json" },
        redirect: "manual",
      });
      // Cloudflare Workers rejects redirect: "error"; fail closed on any 3xx or opaque redirect.
      if (!response.ok || (response.status >= 300 && response.status < 400)) {
        options.onJwksError?.({ reason: "http_error", status: response.status });
        return null;
      }

      const body = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(body.keys)) {
        options.onJwksError?.({ reason: "invalid_payload" });
        return null;
      }

      const keys = new Map<string, JwksKey>();
      for (const candidate of body.keys) {
        if (!isJwksKey(candidate)) {
          continue;
        }
        keys.set(candidate.kid, candidate);
      }

      if (keys.size === 0) {
        options.onJwksError?.({ reason: "empty_keys" });
        return null;
      }

      return { fetchedAt: now(), keys };
    } catch (error) {
      options.onJwksError?.({ reason: "fetch_threw", error });
      return null;
    }
  }

  async function getSigningKey(
    kid: string,
  ): Promise<{ key: JwksKey } | { reason: SupabaseJwtFailureReason }> {
    const current = now();
    const fresh =
      cache !== null && current - cache.fetchedAt < cacheTtlMs && cache.keys.has(kid);

    if (!fresh) {
      const refreshed = await fetchKeys();
      if (!refreshed) {
        return { reason: "jwks_unavailable" };
      }
      cache = refreshed;
    }

    const key = cache?.keys.get(kid);
    return key ? { key } : { reason: "unknown_key" };
  }

  async function verify(
    token: string,
  ): Promise<SupabaseJwtVerificationResult> {
    if (!token) {
      return { ok: false, reason: "missing_token" };
    }

    if (token.length > MAX_TOKEN_LENGTH) {
      return { ok: false, reason: "malformed_token" };
    }

    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      return { ok: false, reason: "malformed_token" };
    }

    const headerJson = decodeJson(parts[0] ?? "");
    const claimsJson = decodeJson(parts[1] ?? "");
    if (headerJson === null || claimsJson === null) {
      return { ok: false, reason: "malformed_token" };
    }

    const header = supabaseJwtHeaderSchema.safeParse(headerJson);
    if (!header.success) {
      return {
        ok: false,
        reason: headerFailureReason(headerJson, algorithms),
      };
    }

    if (!algorithms.has(header.data.alg)) {
      return { ok: false, reason: "unsupported_algorithm" };
    }

    const claims = supabaseJwtClaimsSchema.safeParse(claimsJson);
    if (!claims.success) {
      return { ok: false, reason: "invalid_claims" };
    }

    if (claims.data.iss !== options.issuer) {
      return { ok: false, reason: "invalid_issuer" };
    }

    if (!audienceMatches(claims.data.aud, options.audience)) {
      return { ok: false, reason: "invalid_audience" };
    }

    const nowSeconds = Math.floor(now() / 1000);
    if (nowSeconds - clockSkewSeconds >= claims.data.exp) {
      return { ok: false, reason: "expired" };
    }

    if (
      claims.data.nbf !== undefined &&
      nowSeconds + clockSkewSeconds < claims.data.nbf
    ) {
      return { ok: false, reason: "not_yet_valid" };
    }

    if (nowSeconds + clockSkewSeconds < claims.data.iat) {
      return { ok: false, reason: "not_yet_valid" };
    }

    const signingKey = await getSigningKey(header.data.kid);
    if ("reason" in signingKey) {
      return { ok: false, reason: signingKey.reason };
    }

    const key = await importVerificationKey(
      signingKey.key,
      header.data.alg,
    ).catch(() => null);
    if (!key) {
      return { ok: false, reason: "invalid_signature" };
    }

    const signature = decodeBase64Url(parts[2] ?? "");
    if (!signature) {
      return { ok: false, reason: "malformed_token" };
    }

    const signingInput = encoder.encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle
      .verify(
        header.data.alg === "RS256"
          ? { name: "RSASSA-PKCS1-v1_5" }
          : { name: "ECDSA", hash: "SHA-256" },
        key,
        signature,
        signingInput,
      )
      .catch(() => false);

    if (!valid) {
      return { ok: false, reason: "invalid_signature" };
    }

    const identity = supabaseIdentitySchema.parse({
      subject: claims.data.sub,
      ...(claims.data.email ? { email: claims.data.email } : {}),
      ...(claims.data.session_id
        ? { sessionId: claims.data.session_id }
        : {}),
    });

    return { ok: true, identity, claims: claims.data };
  }

  return { verify };
}

function isJwksKey(value: unknown): value is JwksKey {
  if (!value || typeof value !== "object") {
    return false;
  }
  const key = value as Record<string, unknown>;
  return typeof key.kid === "string" && key.kid.length > 0;
}

async function importVerificationKey(
  jwk: JwksKey,
  algorithm: SupabaseJwtAlgorithm,
): Promise<CryptoKey> {
  if (jwk.alg && jwk.alg !== algorithm) {
    throw new Error("jwk_algorithm_mismatch");
  }
  if (jwk.use && jwk.use !== "sig") {
    throw new Error("jwk_not_for_signatures");
  }

  if (algorithm === "RS256") {
    if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
      throw new Error("invalid_rsa_jwk");
    }
    return crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }

  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
    throw new Error("invalid_ec_jwk");
  }
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

function audienceMatches(
  audience: string | string[],
  expected: string,
): boolean {
  return Array.isArray(audience)
    ? audience.includes(expected)
    : audience === expected;
}

function headerFailureReason(
  value: unknown,
  algorithms: ReadonlySet<SupabaseJwtAlgorithm>,
): SupabaseJwtFailureReason {
  if (!value || typeof value !== "object") {
    return "malformed_token";
  }
  const algorithm = (value as Record<string, unknown>).alg;
  if (typeof algorithm !== "string") {
    return "malformed_token";
  }
  return algorithms.has(algorithm as SupabaseJwtAlgorithm)
    ? "malformed_token"
    : "unsupported_algorithm";
}

function decodeJson(value: string): unknown {
  const bytes = decodeBase64Url(value);
  if (!bytes) {
    return null;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!value || !BASE64URL_PATTERN.test(value)) {
    return null;
  }
  const base64 =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}
