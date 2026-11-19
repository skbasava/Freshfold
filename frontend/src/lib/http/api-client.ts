import {
  HEADER_HUB_ID,
  HEADER_RC_VERSION,
  HEADER_TENANT_ID,
  REQUEST_ID_HEADER,
} from "@laundry/contracts";
import {
  getActiveSessionContext,
  setActiveRcVersion,
} from "./session-store";

type TokenRefresher = () => Promise<string | null>;

let registeredRefresher: TokenRefresher | null = null;

export function registerAccessTokenRefresher(
  refresher: TokenRefresher | null,
): void {
  registeredRefresher = refresher;
}

export function readApiBaseUrl(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): string {
  const raw =
    (typeof env.VITE_API_URL === "string" && env.VITE_API_URL.trim()) ||
    (typeof env.VITE_API_BASE_URL === "string" &&
      env.VITE_API_BASE_URL.trim()) ||
    "";
  return raw.replace(/\/+$/, "");
}

function createRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface ApiFetchOptions extends Omit<RequestInit, "headers"> {
  headers?: HeadersInit;
  /** Explicit Bearer token override (defaults to active in-memory session token). */
  accessToken?: string;
  /** Set false to disable automatic single refresh+retry on HTTP 401. */
  retryOnUnauthorized?: boolean;
  /** Custom fetch implementation for testing. */
  fetchImpl?: typeof fetch;
}

function buildHeaders(
  inputHeaders: HeadersInit | undefined,
  token: string | null,
): Headers {
  const headers = new Headers(inputHeaders);
  const ctx = getActiveSessionContext();

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (!headers.has(REQUEST_ID_HEADER)) {
    headers.set(REQUEST_ID_HEADER, createRequestId());
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (ctx.tenantId && !headers.has(HEADER_TENANT_ID)) {
    headers.set(HEADER_TENANT_ID, ctx.tenantId);
  }
  if (ctx.hubId && !headers.has(HEADER_HUB_ID)) {
    headers.set(HEADER_HUB_ID, ctx.hubId);
  }
  if (ctx.rcVersion && !headers.has(HEADER_RC_VERSION)) {
    headers.set(HEADER_RC_VERSION, ctx.rcVersion);
  }

  return headers;
}

/**
 * Centralized authenticated HTTP client for the FreshFold Gateway API.
 * Attaches Bearer JWT + standard FreshFold headers (`x-tenant-id`, `x-hub-id`,
 * `x-rc-version`, `x-request-id`), syncs `x-rc-version` responses, and performs
 * a single transparent token refresh + retry when receiving HTTP 401.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const {
    headers: inputHeaders,
    accessToken,
    retryOnUnauthorized = true,
    fetchImpl = fetch,
    ...init
  } = options;

  const baseUrl = readApiBaseUrl();
  const url = path.startsWith("http")
    ? path
    : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const initialToken = accessToken ?? getActiveSessionContext().accessToken;
  let response = await fetchImpl(url, {
    ...init,
    headers: buildHeaders(inputHeaders, initialToken),
  });

  if (
    response.status === 401 &&
    retryOnUnauthorized &&
    !accessToken &&
    registeredRefresher
  ) {
    const refreshedToken = await registeredRefresher();
    if (refreshedToken && refreshedToken !== initialToken) {
      response = await fetchImpl(url, {
        ...init,
        headers: buildHeaders(inputHeaders, refreshedToken),
      });
    }
  }

  const nextRcVersion = response.headers.get(HEADER_RC_VERSION);
  if (nextRcVersion) {
    setActiveRcVersion(nextRcVersion);
  }

  return response;
}
