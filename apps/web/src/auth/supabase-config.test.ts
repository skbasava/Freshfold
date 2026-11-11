import { describe, expect, it } from "vitest";
import {
  readSupabaseAuthConfig,
  readSupabaseConfig,
} from "./supabase-config";

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

const anonKey = fakeJwt({ role: "anon", iss: "supabase" });

describe("Supabase frontend configuration", () => {
  it("reads the public URL, anon key and redirect URL", () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "https://project.supabase.co/",
        VITE_SUPABASE_ANON_KEY: anonKey,
        VITE_SUPABASE_REDIRECT_URL: "http://localhost:5173/reset-password",
      }),
    ).toEqual({
      url: "https://project.supabase.co",
      anonKey,
      redirectUrl: "http://localhost:5173/reset-password",
    });
  });

  it("disables Supabase when configuration is missing or still a placeholder", () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "https://your-project-ref.supabase.co",
        VITE_SUPABASE_ANON_KEY: "replace-with-public-anon-key",
      }),
    ).toBeNull();
  });

  it("fails closed when a service-role key is supplied to the browser", () => {
    const serviceKey = fakeJwt({ role: "service_role", iss: "supabase" });
    expect(() =>
      readSupabaseConfig({
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: serviceKey,
      }),
    ).toThrow(/service-role key/i);
    expect(() =>
      readSupabaseConfig({
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "sb_secret_example",
      }),
    ).toThrow(/service-role key/i);
  });

  it("configures the PKCE auth flow explicitly", () => {
    expect(
      readSupabaseAuthConfig({
        VITE_SUPABASE_URL: "https://project.supabase.co",
        VITE_SUPABASE_ANON_KEY: anonKey,
      }),
    ).toMatchObject({
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        storage: window.sessionStorage,
      },
    });
  });
});
