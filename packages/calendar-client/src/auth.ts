export const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ServiceAccountCredentials = {
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
};

export type CreateAssertionInput = {
  credentials: ServiceAccountCredentials;
  now: number;
  scope?: string;
  tokenUri?: string;
  lifetimeSeconds?: number;
  clockSkewMs?: number;
};

export class GoogleAuthError extends Error {
  constructor(
    readonly code:
      | "google_private_key_invalid"
      | "google_assertion_sign_failed"
      | "google_token_exchange_failed"
      | "google_token_response_invalid",
    readonly status?: number,
  ) {
    super(code);
    this.name = "GoogleAuthError";
  }
}

type CachedToken = {
  token: string;
  expiresAt: number;
};

export type GoogleAccessTokenProviderOptions = {
  credentials: ServiceAccountCredentials;
  fetch?: FetchLike;
  now?: () => number;
  scope?: string;
  tokenUri?: string;
  skewMs?: number;
};

const encoder = new TextEncoder();

export async function createServiceAccountAssertion({
  credentials,
  now,
  scope = GOOGLE_CALENDAR_SCOPE,
  tokenUri = GOOGLE_TOKEN_URI,
  lifetimeSeconds = 3600,
  clockSkewMs = 60_000,
}: CreateAssertionInput): Promise<string> {
  if (!Number.isFinite(now)) {
    throw new GoogleAuthError("google_assertion_sign_failed");
  }

  const issuedAt = Math.floor((now - clockSkewMs) / 1000);
  const lifetime = Math.min(Math.max(lifetimeSeconds, 1), 3600);
  const header = {
    alg: "RS256",
    typ: "JWT",
    ...(credentials.privateKeyId ? { kid: credentials.privateKeyId } : {}),
  };
  const payload = {
    iss: credentials.clientEmail,
    scope,
    aud: tokenUri,
    iat: issuedAt,
    exp: issuedAt + lifetime,
  };

  const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(
    encoder.encode(JSON.stringify(payload)),
  )}`;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      decodePrivateKey(credentials.privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new GoogleAuthError("google_private_key_invalid");
  }

  let signature: ArrayBuffer;
  try {
    signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      encoder.encode(signingInput),
    );
  } catch {
    throw new GoogleAuthError("google_assertion_sign_failed");
  }

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export class GoogleAccessTokenProvider {
  private readonly credentials: ServiceAccountCredentials;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly scope: string;
  private readonly tokenUri: string;
  private readonly skewMs: number;
  private cached: CachedToken | null = null;
  private pending: Promise<string> | null = null;

  constructor(options: GoogleAccessTokenProviderOptions) {
    this.credentials = options.credentials;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.scope = options.scope ?? GOOGLE_CALENDAR_SCOPE;
    this.tokenUri = options.tokenUri ?? GOOGLE_TOKEN_URI;
    this.skewMs = options.skewMs ?? 60_000;
  }

  async getAccessToken(): Promise<string> {
    const now = this.now();
    if (this.cached && this.cached.expiresAt - this.skewMs > now) {
      return this.cached.token;
    }

    if (this.pending) {
      return this.pending;
    }

    this.pending = this.refresh(now).finally(() => {
      this.pending = null;
    });

    return this.pending;
  }

  invalidate(): void {
    this.cached = null;
  }

  private async refresh(now: number): Promise<string> {
    const assertion = await createServiceAccountAssertion({
      credentials: this.credentials,
      now,
      scope: this.scope,
      tokenUri: this.tokenUri,
    });

    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(this.tokenUri, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
    } catch {
      throw new GoogleAuthError("google_token_exchange_failed");
    }

    if (!response.ok) {
      throw new GoogleAuthError(
        "google_token_exchange_failed",
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GoogleAuthError("google_token_response_invalid");
    }

    const token =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>).access_token
        : undefined;
    const expiresIn =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>).expires_in
        : undefined;

    if (typeof token !== "string" || token.length === 0) {
      throw new GoogleAuthError("google_token_response_invalid");
    }

    const lifetimeSeconds =
      typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? Math.max(expiresIn, 1)
        : 3600;

    this.cached = {
      token,
      expiresAt: now + lifetimeSeconds * 1000,
    };

    return token;
  }
}

function decodePrivateKey(value: string): Uint8Array {
  const normalized = value.replace(/\\n/g, "\n").trim();
  const match = normalized.match(
    /-----BEGIN [^-]+-----([\s\S]+?)-----END [^-]+-----/,
  );
  const base64 = (match?.[1] ?? normalized).replace(/\s+/g, "");
  if (!base64) {
    throw new Error("empty private key");
  }

  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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
