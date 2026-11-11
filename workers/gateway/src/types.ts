import type { InternalContext } from "../../../packages/contracts/src/auth";

export type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type GatewayBindings = {
  AUTH: Fetcher;
  LAUNDRY?: Fetcher;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  INTERNAL_CONTEXT_SECRET?: string;
  INTERNAL_CONTEXT_KEY_ID?: string;
  LOGIN_RATE_LIMITER?: RateLimitBinding;
  MUTATION_RATE_LIMITER?: RateLimitBinding;
};

export type GatewayVariables = {
  auth: InternalContext;
  requestId: string;
  internalHeaders: Record<string, string>;
};

export type GatewayEnv = {
  Bindings: GatewayBindings;
  Variables: GatewayVariables;
};
