import type { InternalContext } from "../../../packages/contracts/src/auth";
import type { SupabaseJwksFetch } from "./auth/supabase-jwt";

export type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type GatewayBindings = {
  AUTH?: Fetcher;
  LAUNDRY?: Fetcher;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  INTERNAL_CONTEXT_SECRET?: string;
  INTERNAL_CONTEXT_KEY_ID?: string;
  SERVICE_TOKEN?: string;
  AUTH_FALLBACK_ENABLED?: string;
  SUPABASE_URL?: string;
  SUPABASE_JWKS_URL?: string;
  SUPABASE_JWT_ISSUER?: string;
  SUPABASE_JWT_AUDIENCE?: string;
  SUPABASE_JWT_ALGORITHMS?: string;
  SUPABASE_JWT_CLOCK_SKEW_SECONDS?: string;
  SUPABASE_JWKS_CACHE_TTL_MS?: string;
  // Dependency-injection seams for deterministic tests; Wrangler does not set these.
  SUPABASE_JWKS_FETCH?: SupabaseJwksFetch;
  SUPABASE_CLOCK?: () => number;
  LOGIN_RATE_LIMITER?: RateLimitBinding;
  MUTATION_RATE_LIMITER?: RateLimitBinding;
};

export type AuthSource = "supabase" | "legacy";

export type GatewayVariables = {
  auth: InternalContext;
  authSource: AuthSource;
  requestId: string;
  internalHeaders: Record<string, string>;
};

export type GatewayEnv = {
  Bindings: GatewayBindings;
  Variables: GatewayVariables;
};
