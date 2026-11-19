import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: {
        configPath: "./workers/api/wrangler.jsonc",
      },
      miniflare: {
        compatibilityDate: "2026-11-11",
        compatibilityFlags: ["nodejs_compat", "disable_ctx_exports"],
        d1Databases: ["DB"],
        r2Buckets: ["STORAGE"],
        bindings: {
          ENVIRONMENT: "test",
          D1_STORAGE_LIMIT_BYTES: "524288000",
          PAYMENT_WEBHOOK_SECRET: "test-webhook-secret-2026",
          TEST_API_MIGRATIONS: await readD1Migrations("migrations/api"),
        },
      },
    })),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
