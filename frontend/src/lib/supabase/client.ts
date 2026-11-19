import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnvConfig } from "./config";

const AUTH_STORAGE_KEY = "freshfold.auth.token";

let cachedClient: SupabaseClient | null = null;

/**
 * Returns the lazily initialized PKCE-configured Supabase Auth client,
 * or `null` when Supabase environment variables are not configured.
 */
export function getSupabaseAuthClient(): SupabaseClient | null {
  if (cachedClient) {
    return cachedClient;
  }

  const config = readSupabaseEnvConfig();
  if (!config) {
    return null;
  }

  cachedClient = createClient(config.url, config.anonKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
    },
  });

  return cachedClient;
}

export function resetSupabaseAuthClientForTest(): void {
  cachedClient = null;
}
