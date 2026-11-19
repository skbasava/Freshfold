import { applyD1Migrations, env as cfEnv } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import { createDbClient } from "../../workers/api/src/infrastructure/db/client";
import { seedDatabase, type SeedResult } from "../../workers/api/src/infrastructure/db/seed";
import { D1AccessRepository } from "../../workers/api/src/infrastructure/repositories/d1-system.repository";
import { createApiApp } from "../../workers/api/src/presentation/app";
import type { ApiEnv } from "../../workers/api/src/presentation/types";

interface CloudflareTestEnv {
  DB: D1Database;
  STORAGE: R2Bucket;
  ENVIRONMENT: string;
  D1_STORAGE_LIMIT_BYTES: string;
  PAYMENT_WEBHOOK_SECRET: string;
  TEST_API_MIGRATIONS: D1Migration[];
}

export interface TestHarness {
  app: ReturnType<typeof createApiApp>;
  env: ApiEnv;
  seed: SeedResult;
  managerAuthHeader: Record<string, string>;
  request: (path: string, init?: RequestInit) => Promise<Response>;
}

const TEST_MANAGER_SUB = "supabase-uid-manager-1";
const TEST_UNASSIGNED_SUB = "supabase-uid-unassigned";

export async function createTestHarness(
  fixedNowIso = "2026-06-15T10:00:00.000Z",
): Promise<TestHarness> {
  const testEnv = cfEnv as unknown as CloudflareTestEnv;
  await applyD1Migrations(testEnv.DB, testEnv.TEST_API_MIGRATIONS);
  const seed = await seedDatabase(testEnv.DB, fixedNowIso);

  const db = createDbClient(testEnv.DB);
  const access = new D1AccessRepository(db);
  await access.upsertStaffUser({
    branchId: seed.branchId,
    supabaseUserId: TEST_MANAGER_SUB,
    email: "priya.manager@freshfold.in",
    fullName: "Priya Manager",
    roleCode: "manager",
    nowIso: fixedNowIso,
  });

  const apiEnv: ApiEnv = {
    DB: testEnv.DB,
    STORAGE: testEnv.STORAGE,
    ENVIRONMENT: "test",
    D1_STORAGE_LIMIT_BYTES: testEnv.D1_STORAGE_LIMIT_BYTES,
    PAYMENT_WEBHOOK_SECRET: testEnv.PAYMENT_WEBHOOK_SECRET,
    TEST_NOW: () => new Date(fixedNowIso),
    TEST_SUPABASE_VERIFIER: {
      async verify(token: string) {
        if (token === "valid-manager-token") {
          return {
            ok: true,
            identity: {
              subject: TEST_MANAGER_SUB,
              email: "priya.manager@freshfold.in",
            },
          };
        }
        if (token === "unassigned-user-token") {
          return {
            ok: true,
            identity: {
              subject: TEST_UNASSIGNED_SUB,
              email: "stranger@freshfold.in",
            },
          };
        }
        return { ok: false, reason: "invalid_signature" };
      },
    },
  };

  const app = createApiApp();
  const managerAuthHeader = { authorization: "Bearer valid-manager-token" };

  return {
    app,
    env: apiEnv,
    seed,
    managerAuthHeader,
    async request(path: string, init?: RequestInit) {
      return app.request(path, init, apiEnv);
    },
  };
}
