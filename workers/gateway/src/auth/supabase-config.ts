import type { GatewayBindings } from "../types";
import {
  createSupabaseJwtVerifier,
  type SupabaseJwtVerifier,
  type SupabaseJwksFetch,
} from "./supabase-jwt";
import type { SupabaseJwtAlgorithm } from "../../../../packages/contracts/src/supabase-auth";

type SupabaseRuntimeConfig = {
  jwksUrl: string;
  issuer: string;
  audience: string;
  algorithms?: SupabaseJwtAlgorithm[];
  clockSkewSeconds?: number;
  cacheTtlMs?: number;
};

let active:
  | {
      configKey: string;
      fetchImpl: SupabaseJwksFetch;
      clock: () => number;
      verifier: SupabaseJwtVerifier;
    }
  | null = null;

export function readSupabaseRuntimeConfig(
  env: GatewayBindings,
): SupabaseRuntimeConfig | null {
  const baseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const jwksUrl =
    env.SUPABASE_JWKS_URL?.trim() ||
    (baseUrl ? `${baseUrl}/auth/v1/.well-known/jwks.json` : "");
  const issuer =
    env.SUPABASE_JWT_ISSUER?.trim() ||
    (baseUrl ? `${baseUrl}/auth/v1` : "");
  const audience = env.SUPABASE_JWT_AUDIENCE?.trim() || "authenticated";

  if (!jwksUrl || !issuer || !audience) {
    return null;
  }

  const algorithms = env.SUPABASE_JWT_ALGORITHMS?.split(",")
    .map((algorithm) => algorithm.trim())
    .filter(Boolean) as SupabaseJwtAlgorithm[] | undefined;

  return {
    jwksUrl,
    issuer,
    audience,
    ...(algorithms && algorithms.length > 0 ? { algorithms } : {}),
    ...(parseNonNegativeInteger(env.SUPABASE_JWT_CLOCK_SKEW_SECONDS) !==
    undefined
      ? {
          clockSkewSeconds: parseNonNegativeInteger(
            env.SUPABASE_JWT_CLOCK_SKEW_SECONDS,
          ),
        }
      : {}),
    ...(parsePositiveInteger(env.SUPABASE_JWKS_CACHE_TTL_MS) !== undefined
      ? {
          cacheTtlMs: parsePositiveInteger(env.SUPABASE_JWKS_CACHE_TTL_MS),
        }
      : {}),
  };
}

export function getSupabaseJwtVerifier(
  env: GatewayBindings,
): SupabaseJwtVerifier | null {
  const config = readSupabaseRuntimeConfig(env);
  if (!config) {
    return null;
  }

  const fetchImpl = env.SUPABASE_JWKS_FETCH ?? fetch;
  const clock = env.SUPABASE_CLOCK ?? Date.now;
  const configKey = [
    config.jwksUrl,
    config.issuer,
    config.audience,
    (config.algorithms ?? ["RS256", "ES256"]).join(","),
    config.clockSkewSeconds ?? "",
    config.cacheTtlMs ?? "",
  ].join("|");

  if (
    active &&
    active.configKey === configKey &&
    active.fetchImpl === fetchImpl &&
    active.clock === clock
  ) {
    return active.verifier;
  }

  const verifier = createSupabaseJwtVerifier({
    ...config,
    fetchImpl,
    now: clock,
  });
  active = { configKey, fetchImpl, clock, verifier };
  return verifier;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeInteger(
  value: string | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
