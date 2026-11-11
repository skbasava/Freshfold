import { describe, expect, it } from "vitest";
import { createSupabaseJwtVerifier } from "../../workers/gateway/src/auth/supabase-jwt";

const ISSUER = "https://project-ref.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const NOW_MS = Date.parse("2026-11-11T04:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW_MS / 1000);

type KeyMaterial = {
  kid: string;
  alg: "RS256" | "ES256";
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
};

const encoder = new TextEncoder();

function base64UrlEncode(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createKey(
  kid: string,
  alg: "RS256" | "ES256",
): Promise<KeyMaterial> {
  const pair = (alg === "RS256"
    ? await crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
      )
    : await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      )) as CryptoKeyPair;

  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    kid,
    alg,
    privateKey: pair.privateKey,
    publicJwk: { ...publicJwk, kid, alg, use: "sig" } as unknown as JsonWebKey,
  };
}

async function signToken(
  key: KeyMaterial,
  claims: Record<string, unknown>,
  headerOverrides: Record<string, unknown> = {},
): Promise<string> {
  const header = {
    alg: key.alg,
    kid: key.kid,
    typ: "JWT",
    ...headerOverrides,
  };
  const head = base64UrlEncode(JSON.stringify(header));
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${head}.${payload}`;
  const algorithm =
    key.alg === "RS256"
      ? { name: "RSASSA-PKCS1-v1_5" }
      : { name: "ECDSA", hash: "SHA-256" };
  const signature = await crypto.subtle.sign(
    algorithm,
    key.privateKey,
    encoder.encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    sub: "11111111-1111-4111-8111-111111111111",
    email: "desk@example.com",
    aud: AUDIENCE,
    iss: ISSUER,
    exp: NOW_SECONDS + 300,
    iat: NOW_SECONDS - 30,
    nbf: NOW_SECONDS - 30,
    role: "authenticated",
    session_id: "22222222-2222-4222-8222-222222222222",
    ...overrides,
  };
}

function jwksResponse(keys: KeyMaterial[]): Response {
  return Response.json({ keys: keys.map((key) => key.publicJwk) });
}

function createFetch(sequence: Array<Response | Error>): {
  calls: string[];
  fetchImpl: (input: RequestInfo | URL) => Promise<Response>;
} {
  const calls: string[] = [];
  return {
    calls,
    fetchImpl: async (input) => {
      calls.push(String(input));
      const next = sequence.shift();
      if (!next) {
        throw new Error("unexpected JWKS fetch");
      }
      if (next instanceof Error) {
        throw next;
      }
      return next.clone();
    },
  };
}

function verifier(
  key: KeyMaterial,
  fetchImpl: (input: RequestInfo | URL) => Promise<Response>,
  overrides: Partial<Parameters<typeof createSupabaseJwtVerifier>[0]> = {},
) {
  return createSupabaseJwtVerifier({
    jwksUrl: JWKS_URL,
    issuer: ISSUER,
    audience: AUDIENCE,
    now: () => NOW_MS,
    fetchImpl,
    ...overrides,
  });
}

describe("Supabase JWT verification", () => {
  it("verifies an RS256 token and returns only verified identity data", async () => {
    const key = await createKey("key-rs", "RS256");
    const fake = createFetch([jwksResponse([key])]);
    const token = await signToken(key, claims());

    const result = await verifier(key, fake.fetchImpl).verify(token);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.identity).toEqual({
      subject: "11111111-1111-4111-8111-111111111111",
      email: "desk@example.com",
      sessionId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.claims.role).toBe("authenticated");
    expect(fake.calls).toEqual([JWKS_URL]);
  });

  it("verifies an ES256 token and accepts an audience array", async () => {
    const key = await createKey("key-es", "ES256");
    const fake = createFetch([jwksResponse([key])]);
    const token = await signToken(
      key,
      claims({ aud: ["authenticated", "other"] }),
    );

    const result = await verifier(key, fake.fetchImpl).verify(token);

    expect(result.ok).toBe(true);
  });

  it("rejects missing, malformed, and unsupported tokens before fetching keys", async () => {
    const key = await createKey("key-rs", "RS256");
    const fake = createFetch([]);
    const instance = verifier(key, fake.fetchImpl);

    await expect(instance.verify("")).resolves.toEqual({
      ok: false,
      reason: "missing_token",
    });
    await expect(instance.verify("one.two")).resolves.toEqual({
      ok: false,
      reason: "malformed_token",
    });
    await expect(instance.verify("a.b.c")).resolves.toEqual({
      ok: false,
      reason: "malformed_token",
    });

    const hsToken = await signToken(key, claims(), { alg: "HS256" });
    await expect(instance.verify(hsToken)).resolves.toEqual({
      ok: false,
      reason: "unsupported_algorithm",
    });
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects tampered signatures and expired or not-yet-valid tokens", async () => {
    const key = await createKey("key-rs", "RS256");
    const fake = createFetch([
      jwksResponse([key]),
      jwksResponse([key]),
      jwksResponse([key]),
      jwksResponse([key]),
    ]);
    const instance = verifier(key, fake.fetchImpl, { clockSkewSeconds: 0 });
    const valid = await signToken(key, claims());

    const tampered = `${valid.slice(0, -2)}aa`;
    await expect(instance.verify(tampered)).resolves.toEqual({
      ok: false,
      reason: "invalid_signature",
    });

    await expect(
      instance.verify(await signToken(key, claims({ exp: NOW_SECONDS - 1 }))),
    ).resolves.toEqual({ ok: false, reason: "expired" });

    await expect(
      instance.verify(
        await signToken(
          key,
          claims({ nbf: NOW_SECONDS + 120 }),
        ),
      ),
    ).resolves.toEqual({ ok: false, reason: "not_yet_valid" });

    await expect(
      instance.verify(
        await signToken(
          key,
          claims({ iat: NOW_SECONDS + 120 }),
        ),
      ),
    ).resolves.toEqual({ ok: false, reason: "not_yet_valid" });
  });

  it("honours the configured clock skew at the expiry and not-before edges", async () => {
    const key = await createKey("key-rs", "RS256");
    const fake = createFetch([jwksResponse([key])]);
    const instance = verifier(key, fake.fetchImpl, { clockSkewSeconds: 60 });

    await expect(
      instance.verify(await signToken(key, claims({ exp: NOW_SECONDS - 30 }))),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      instance.verify(
        await signToken(key, claims({ nbf: NOW_SECONDS + 30 })),
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("rejects the wrong issuer and audience", async () => {
    const key = await createKey("key-rs", "RS256");
    const fake = createFetch([
      jwksResponse([key]),
      jwksResponse([key]),
    ]);
    const instance = verifier(key, fake.fetchImpl);

    await expect(
      instance.verify(
        await signToken(key, claims({ iss: "https://evil.example/auth/v1" })),
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_issuer" });

    await expect(
      instance.verify(await signToken(key, claims({ aud: "other" }))),
    ).resolves.toEqual({ ok: false, reason: "invalid_audience" });
  });

  it("refreshes JWKS when an unknown key ID appears", async () => {
    const first = await createKey("key-1", "RS256");
    const rotated = await createKey("key-2", "RS256");
    const fake = createFetch([
      jwksResponse([first]),
      jwksResponse([first, rotated]),
    ]);
    const instance = verifier(first, fake.fetchImpl);

    const initial = await signToken(first, claims());
    await expect(instance.verify(initial)).resolves.toMatchObject({ ok: true });

    const rotatedToken = await signToken(rotated, claims());
    await expect(instance.verify(rotatedToken)).resolves.toMatchObject({
      ok: true,
    });
    expect(fake.calls).toHaveLength(2);
  });

  it("rejects an unknown key after refresh", async () => {
    const known = await createKey("key-1", "RS256");
    const unknown = await createKey("key-2", "RS256");
    const fake = createFetch([
      jwksResponse([known]),
      jwksResponse([known]),
    ]);
    const instance = verifier(known, fake.fetchImpl);

    const result = await instance.verify(await signToken(unknown, claims()));

    expect(result).toEqual({ ok: false, reason: "unknown_key" });
  });

  it("fails closed when JWKS retrieval fails or is malformed", async () => {
    const key = await createKey("key-rs", "RS256");
    const token = await signToken(key, claims());
    const failedFetch = createFetch([new Error("network down")]);
    const malformedFetch = createFetch([Response.json({ keys: "nope" })]);

    await expect(
      verifier(key, failedFetch.fetchImpl).verify(token),
    ).resolves.toEqual({ ok: false, reason: "jwks_unavailable" });
    await expect(
      verifier(key, malformedFetch.fetchImpl).verify(token),
    ).resolves.toEqual({ ok: false, reason: "jwks_unavailable" });
  });

  it("refreshes after the bounded cache interval and does not reuse stale keys", async () => {
    const key = await createKey("key-rs", "RS256");
    let now = NOW_MS;
    const fake = createFetch([
      jwksResponse([key]),
      jwksResponse([key]),
      new Error("network down"),
    ]);
    const instance = createSupabaseJwtVerifier({
      jwksUrl: JWKS_URL,
      issuer: ISSUER,
      audience: AUDIENCE,
      now: () => now,
      fetchImpl: fake.fetchImpl,
      cacheTtlMs: 60_000,
    });
    const token = await signToken(key, claims());

    await expect(instance.verify(token)).resolves.toMatchObject({ ok: true });
    now += 61_000;
    await expect(instance.verify(token)).resolves.toMatchObject({ ok: true });
    now += 61_000;
    await expect(instance.verify(token)).resolves.toEqual({
      ok: false,
      reason: "jwks_unavailable",
    });
    expect(fake.calls).toHaveLength(3);
  });
});
