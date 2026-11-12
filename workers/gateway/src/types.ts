import type {
  InternalContext,
  SessionResponse,
} from "../../../packages/contracts/src/auth";
import type { SupabaseJwksFetch } from "./auth/supabase-jwt";

export type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type GatewayBindings = {
  LAUNDRY?: Fetcher;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  DEV_FRONTEND_URL?: string;
  INTERNAL_CONTEXT_SECRET?: string;
  INTERNAL_CONTEXT_KEY_ID?: string;
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
  MUTATION_RATE_LIMITER?: RateLimitBinding;
};

export type GatewayVariables = {
  auth: InternalContext;
  session: SessionResponse;
  requestId: string;
  internalHeaders: Record<string, string>;
};

export type GatewayEnv = {
  Bindings: GatewayBindings;
  Variables: GatewayVariables;
};
