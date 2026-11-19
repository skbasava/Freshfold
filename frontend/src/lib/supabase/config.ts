export interface SupabaseEnvConfig {
  url: string;
  anonKey: string;
}

const PLACEHOLDER_FRAGMENTS = [
  "your-project",
  "your-anon-key",
  "replace-me",
  "example.supabase.co",
];

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

function isAllowedSupabaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "https:") {
      return Boolean(parsed.hostname);
    }
    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Validates public Supabase Auth environment variables.
 * Rejects empty, malformed, insecure non-local HTTP, or placeholder values.
 */
export function readSupabaseEnvConfig(
  env: Record<string, unknown> = import.meta.env as Record<string, unknown>,
): SupabaseEnvConfig | null {
  const rawUrl =
    typeof env.VITE_SUPABASE_URL === "string"
      ? env.VITE_SUPABASE_URL.trim()
      : "";
  const rawAnonKey =
    typeof env.VITE_SUPABASE_ANON_KEY === "string"
      ? env.VITE_SUPABASE_ANON_KEY.trim()
      : "";

  if (!rawUrl || !rawAnonKey) {
    return null;
  }

  if (isPlaceholder(rawUrl) || isPlaceholder(rawAnonKey)) {
    return null;
  }

  if (!isAllowedSupabaseUrl(rawUrl)) {
    return null;
  }

  return {
    url: rawUrl.replace(/\/+$/, ""),
    anonKey: rawAnonKey,
  };
}
