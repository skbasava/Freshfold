export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
  redirectUrl?: string;
}

export interface SupabaseAuthConfig extends SupabasePublicConfig {
  auth: {
    flowType: "pkce";
    detectSessionInUrl: true;
    persistSession: true;
    autoRefreshToken: true;
    storage?: Storage;
  };
}

type EnvRecord = Record<string, string | boolean | undefined>;

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  return atob(padded);
}

function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(parts[1]));
    if (
      payload !== null &&
      typeof payload === "object" &&
      "role" in payload &&
      typeof payload.role === "string"
    ) {
      return payload.role;
    }
  } catch {
    return null;
  }
  return null;
}

export function isServiceRoleKey(key: string): boolean {
  const normalized = key.trim();
  if (
    normalized.startsWith("sb_secret_") ||
    normalized.toLowerCase().includes("service_role")
  ) {
    return true;
  }
  return jwtRole(normalized) === "service_role";
}

function isPlaceholder(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("your-project-ref") ||
    normalized.includes("replace-with") ||
    normalized.includes("example")
  );
}

/**
 * Reads only public Supabase settings. The anon key is not a secret, but the
 * service-role key must never reach the browser, so a detected key fails closed.
 */
export function readSupabaseConfig(env: EnvRecord): SupabasePublicConfig | null {
  const url = readString(env.VITE_SUPABASE_URL);
  const anonKey = readString(env.VITE_SUPABASE_ANON_KEY);

  if (!url || !anonKey || isPlaceholder(url) || isPlaceholder(anonKey)) {
    if (anonKey && isServiceRoleKey(anonKey)) {
      throw new Error(
        "A Supabase service-role key was supplied to the browser. Use the public anon key only.",
      );
    }
    return null;
  }

  if (isServiceRoleKey(anonKey)) {
    throw new Error(
      "A Supabase service-role key was supplied to the browser. Use the public anon key only.",
    );
  }

  const redirectUrl = readString(env.VITE_SUPABASE_REDIRECT_URL);

  return {
    url: url.replace(/\/$/, ""),
    anonKey,
    ...(redirectUrl ? { redirectUrl } : {}),
  };
}

export function readSupabaseAuthConfig(
  env: EnvRecord,
): SupabaseAuthConfig | null {
  const config = readSupabaseConfig(env);
  if (!config) {
    return null;
  }

  return {
    ...config,
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      ...(typeof window === "undefined"
        ? {}
        : { storage: window.sessionStorage }),
    },
  };
}

export function defaultResetRedirectUrl(
  config: SupabasePublicConfig,
  origin: string | undefined = typeof window === "undefined"
    ? undefined
    : window.location.origin,
): string | undefined {
  if (config.redirectUrl) {
    return config.redirectUrl;
  }
  return origin ? `${origin}/reset-password` : undefined;
}

export function defaultOAuthCallbackUrl(
  origin: string | undefined = typeof window === "undefined"
    ? undefined
    : window.location.origin,
): string | undefined {
  return origin ? `${origin.replace(/\/$/, "")}/login/callback` : undefined;
}
