export const SUPABASE_ISSUER =
  "https://project-ref.supabase.co/auth/v1";
export const SUPABASE_AUDIENCE = "authenticated";
export const SUPABASE_JWKS_URL = `${SUPABASE_ISSUER}/.well-known/jwks.json`;
export const SUPABASE_NOW_MS = Date.parse("2026-11-11T04:00:00.000Z");
export const SUPABASE_NOW_SECONDS = Math.floor(SUPABASE_NOW_MS / 1000);

const encoder = new TextEncoder();

export type TestKey = {
  kid: string;
  alg: "RS256" | "ES256";
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
};

export type TestClaims = Record<string, unknown>;

export function base64UrlEncode(value: Uint8Array | string): string {
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

export async function createTestKey(
  kid: string,
  alg: "RS256" | "ES256" = "RS256",
): Promise<TestKey> {
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

export function testClaims(overrides: TestClaims = {}): TestClaims {
  return {
    sub: "subject-desk",
    email: "desk@example.com",
    aud: SUPABASE_AUDIENCE,
    iss: SUPABASE_ISSUER,
    exp: SUPABASE_NOW_SECONDS + 300,
    iat: SUPABASE_NOW_SECONDS - 30,
    nbf: SUPABASE_NOW_SECONDS - 30,
    role: "authenticated",
    session_id: "session-1",
    ...overrides,
  };
}

export async function signSupabaseToken(
  key: TestKey,
  claims: TestClaims,
  headerOverrides: TestClaims = {},
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
  const signature = await crypto.subtle.sign(
    key.alg === "RS256"
      ? { name: "RSASSA-PKCS1-v1_5" }
      : { name: "ECDSA", hash: "SHA-256" },
    key.privateKey,
    encoder.encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export function jwksFetch(keys: TestKey[]): {
  calls: string[];
  fetchImpl: (input: RequestInfo | URL) => Promise<Response>;
} {
  const calls: string[] = [];
  return {
    calls,
    fetchImpl: async (input) => {
      calls.push(String(input));
      return Response.json({ keys: keys.map((key) => key.publicJwk) });
    },
  };
}

export async function seedEmployee(
  db: D1Database,
  input: {
    id: string;
    subject: string;
    email?: string;
    displayName?: string;
    status?: "active" | "inactive" | "revoked";
    memberships: Array<{
      tenantId: string;
      hubId: string;
      role: "front_desk" | "manager" | "service";
      createdAt?: number;
    }>;
  },
): Promise<void> {
  const now = 1;
  await db
    .prepare(
      `INSERT INTO employees
        (id, supabase_subject, email, display_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.subject,
      input.email ?? `${input.id}@example.com`,
      input.displayName ?? `Employee ${input.id}`,
      input.status ?? "active",
      now,
      now,
    )
    .run();

  for (const membership of input.memberships) {
    await db
      .prepare(
        `INSERT INTO employee_hub_memberships
          (employee_id, tenant_id, hub_id, role, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        membership.tenantId,
        membership.hubId,
        membership.role,
        membership.createdAt ?? now,
      )
      .run();
  }
}
