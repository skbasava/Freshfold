import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import webPackageJson from "../../frontend/package.json";

declare global {
  interface ImportMeta {
    glob(
      pattern: string,
      options: Record<string, unknown>,
    ): Record<string, string>;
  }
}

type RawModules = Record<string, string>;

const workerSources = Object.values(
  import.meta.glob("../../workers/**/*.{ts,jsonc}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as RawModules,
).join("\n");

const sharedSources = Object.values(
  import.meta.glob("../../packages/{contracts,domain,shared}/src/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as RawModules,
).join("\n");

const webSources = Object.values(
  import.meta.glob("../../frontend/src/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as RawModules,
).join("\n");

const webEnvSources = Object.values(
  import.meta.glob("../../frontend/.env*", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as RawModules,
).join("\n");

const laundrySources = Object.values(
  import.meta.glob("../../workers/laundry/**/*.{ts,jsonc}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as RawModules,
).join("\n");

describe("Supabase architectural boundaries", () => {
  it("allows the public browser client only in the web app", () => {
    expect(`${workerSources}\n${sharedSources}`).not.toMatch(
      /@supabase\/supabase-js/,
    );
    expect(`${workerSources}\n${sharedSources}`).not.toMatch(
      /createClient\s*\(/,
    );
    expect(webSources).toMatch(/@supabase\/supabase-js/);
    expect(
      Object.keys(webPackageJson.dependencies ?? {}),
    ).toContain("@supabase/supabase-js");
    expect(
      Object.keys(packageJson.dependencies ?? {}),
    ).not.toContain("@supabase/supabase-js");
  });

  it("never ships a service-role key to the browser", () => {
    expect(webSources).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(webEnvSources).not.toMatch(/SERVICE_ROLE|sb_secret_/);
  });

  it("keeps the Laundry Worker free of Supabase bindings and clients", () => {
    expect(laundrySources).not.toMatch(/@supabase\//);
    expect(laundrySources).not.toMatch(/SUPABASE_[A-Z_]+/);
    expect(laundrySources).not.toMatch(/createClient\s*\(/);
  });

  it("keeps the Supabase public anon key out of server Workers", () => {
    expect(`${workerSources}\n${sharedSources}`).not.toMatch(
      /SUPABASE_ANON_KEY/,
    );
  });
});
