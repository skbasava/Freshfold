import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_TOKEN_URI,
  GoogleAccessTokenProvider,
  GoogleAuthError,
  createServiceAccountAssertion,
  type ServiceAccountCredentials,
} from "../../packages/calendar-client/src/auth";

const encoder = new TextEncoder();

function base64UrlDecode(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function pem(label: string, bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  const lines = btoa(binary).match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

async function createCredentials(): Promise<{
  credentials: ServiceAccountCredentials;
  publicKey: CryptoKey;
}> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;

  const privateKey = pem(
    "PRIVATE KEY",
    (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer,
  );
  const publicKey = (await crypto.subtle.importKey(
    "spki",
    (await crypto.subtle.exportKey("spki", pair.publicKey)) as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  )) as CryptoKey;

  return {
    credentials: {
      clientEmail: "calendar-service@example.iam.gserviceaccount.com",
      privateKey,
      privateKeyId: "key-1",
    },
    publicKey,
  };
}

function decodeJwt(assertion: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Uint8Array;
} {
  const [encodedHeader, encodedPayload, encodedSignature] =
    assertion.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("assertion is not a three-part JWT");
  }

  return {
    header: JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader))),
    payload: JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload)),
    ),
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature: base64UrlDecode(encodedSignature),
  };
}

describe("Google service-account JWT assertion", () => {
  it("signs an RS256 assertion with Google token claims and a short lifetime", async () => {
    const { credentials, publicKey } = await createCredentials();
    const now = Date.parse("2026-11-11T04:00:00.000Z");

    const assertion = await createServiceAccountAssertion({
      credentials,
      now,
      scope: GOOGLE_CALENDAR_SCOPE,
    });

    const decoded = decodeJwt(assertion);
    expect(decoded.header).toMatchObject({
      alg: "RS256",
      typ: "JWT",
      kid: "key-1",
    });
    expect(decoded.payload).toMatchObject({
      iss: "calendar-service@example.iam.gserviceaccount.com",
      scope: GOOGLE_CALENDAR_SCOPE,
      aud: GOOGLE_TOKEN_URI,
    });

    const issuedAt = Number(decoded.payload.iat);
    const expiresAt = Number(decoded.payload.exp);
    expect(issuedAt).toBeLessThanOrEqual(Math.floor(now / 1000));
    expect(expiresAt).toBeGreaterThan(Math.floor(now / 1000));
    expect(expiresAt - issuedAt).toBeLessThanOrEqual(3600);

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      decoded.signature,
      encoder.encode(decoded.signingInput),
    );
    expect(valid).toBe(true);
  });

  it("accepts an explicit token endpoint for staging or local fixtures", async () => {
    const { credentials } = await createCredentials();

    const assertion = await createServiceAccountAssertion({
      credentials,
      now: Date.parse("2026-11-11T04:00:00.000Z"),
      tokenUri: "https://oauth.example.test/token",
    });

    expect(decodeJwt(assertion).payload.aud).toBe(
      "https://oauth.example.test/token",
    );
  });
});

describe("Google access-token provider", () => {
  it("exchanges the assertion and caches the token until near expiry", async () => {
    const { credentials } = await createCredentials();
    let now = Date.parse("2026-11-11T04:00:00.000Z");
    const calls: Array<{
      request: Request;
      body: { get(name: string): unknown };
    }> = [];
    let counter = 0;

    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const body = await request.clone().formData();
      calls.push({ request, body });
      counter += 1;
      return Response.json({
        access_token: `token-${counter}`,
        expires_in: 3600,
        token_type: "Bearer",
      });
    });

    const provider = new GoogleAccessTokenProvider({
      credentials,
      fetch,
      now: () => now,
      skewMs: 60_000,
    });

    await expect(provider.getAccessToken()).resolves.toBe("token-1");
    await expect(provider.getAccessToken()).resolves.toBe("token-1");
    expect(fetch).toHaveBeenCalledTimes(1);

    expect(calls[0]?.request.url).toBe(GOOGLE_TOKEN_URI);
    expect(calls[0]?.request.method).toBe("POST");
    expect(calls[0]?.request.headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(calls[0]?.body.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    expect(calls[0]?.body.get("assertion")).toBeTruthy();
    expect(decodeJwt(String(calls[0]?.body.get("assertion") ?? "")).payload.aud).toBe(
      GOOGLE_TOKEN_URI,
    );

    now += 3600_000 - 30_000;
    await expect(provider.getAccessToken()).resolves.toBe("token-2");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refreshes after the cached token expires", async () => {
    const { credentials } = await createCredentials();
    let now = Date.parse("2026-11-11T04:00:00.000Z");
    let counter = 0;
    const fetch = vi.fn(async () => {
      counter += 1;
      return Response.json({
        access_token: `token-${counter}`,
        expires_in: 3600,
      });
    });

    const provider = new GoogleAccessTokenProvider({
      credentials,
      fetch,
      now: () => now,
    });

    expect(await provider.getAccessToken()).toBe("token-1");
    now += 3601_000;
    expect(await provider.getAccessToken()).toBe("token-2");
  });

  it("fails closed without leaking the assertion when token exchange fails", async () => {
    const { credentials } = await createCredentials();
    const fetch = vi.fn(async () =>
      Response.json({ error: "invalid_grant" }, { status: 400 }),
    );

    const provider = new GoogleAccessTokenProvider({
      credentials,
      fetch,
      now: () => Date.parse("2026-11-11T04:00:00.000Z"),
    });

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(
      GoogleAuthError,
    );
    await expect(provider.getAccessToken()).rejects.toThrow(
      "google_token_exchange_failed",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid private key without echoing its contents", async () => {
    const provider = new GoogleAccessTokenProvider({
      credentials: {
        clientEmail: "broken@example.iam.gserviceaccount.com",
        privateKey: "not-a-private-key",
      },
      fetch: vi.fn(),
      now: () => Date.parse("2026-11-11T04:00:00.000Z"),
    });

    await expect(provider.getAccessToken()).rejects.toThrow(
      "google_private_key_invalid",
    );
  });
});
