import { describe, expect, it } from "vitest";
import { readSupabaseEnvConfig } from "./config";

describe("readSupabaseEnvConfig", () => {
  it("returns normalized config for valid HTTPS Supabase credentials", () => {
    const config = readSupabaseEnvConfig({
      VITE_SUPABASE_URL: "https://abcd1234.supabase.co///",
      VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid",
    });

    expect(config).toEqual({
      url: "https://abcd1234.supabase.co",
      anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid",
    });
  });

  it("allows localhost HTTP URLs for local Supabase CLI development", () => {
    const config = readSupabaseEnvConfig({
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "local-dev-anon-key-value",
    });

    expect(config).toEqual({
      url: "http://127.0.0.1:54321",
      anonKey: "local-dev-anon-key-value",
    });
  });

  it("rejects insecure non-local HTTP URLs", () => {
    expect(
      readSupabaseEnvConfig({
        VITE_SUPABASE_URL: "http://abcd1234.supabase.co",
        VITE_SUPABASE_ANON_KEY: "eyJ-valid-key",
      }),
    ).toBeNull();
  });

  it("rejects placeholder and missing values", () => {
    expect(
      readSupabaseEnvConfig({
        VITE_SUPABASE_URL: "https://your-project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "your-anon-key",
      }),
    ).toBeNull();

    expect(readSupabaseEnvConfig({})).toBeNull();
  });
});
