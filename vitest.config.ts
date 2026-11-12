import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

declare const process: { cwd(): string };

const projectRoot = `file://${process.cwd().replace(/\\/g, "/")}/`;

const packageAliases = {
  "@laundry/contracts": "./packages/contracts/src/index.ts",
  "@laundry/domain": "./packages/domain/src/index.ts",
  "@laundry/shared": "./packages/shared/src/index.ts",
  "@laundry/calendar-client": "./packages/calendar-client/src/index.ts",
  "@laundry/notification-client": "./packages/notification-client/src/index.ts",
} as const;

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      Object.entries(packageAliases).map(([name, path]) => [
        name,
        new URL(path, projectRoot).pathname,
      ]),
    ),
  },
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        compatibilityDate: "2026-11-11",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["LAUNDRY_DB"],
        bindings: {
          TEST_LAUNDRY_MIGRATIONS: await readD1Migrations("migrations/laundry"),
        },
      },
    })),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
