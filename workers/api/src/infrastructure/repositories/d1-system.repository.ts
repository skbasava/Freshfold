import { and, eq } from "drizzle-orm";
import type {
  AccessRepository,
  AuditLogInput,
  DatabaseStorageMetrics,
  IdempotencyRecord,
  StaffUserRecord,
  SystemRepository,
} from "../../domain/repositories/system.repository";
import type { RoleCode } from "../../shared/constants";
import { mapSqliteError, type ApiDatabase } from "../db/client";
import {
  appSettings,
  auditLogs,
  idempotencyKeys,
  roles,
  userRoles,
  users,
} from "../db/schema";

const MONITORED_TABLES = [
  "customers",
  "orders",
  "order_items",
  "order_status_history",
  "invoices",
  "invoice_items",
  "payments",
  "payment_transactions",
  "deliveries",
  "audit_logs",
  "idempotency_keys",
] as const;

export class D1AccessRepository implements AccessRepository {
  constructor(private readonly db: ApiDatabase) {}

  async findBySupabaseUserId(
    supabaseUserId: string,
  ): Promise<StaffUserRecord | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.supabaseUserId, supabaseUserId))
      .limit(1);
    if (!user) return null;
    return this.attachRoles(user);
  }

  async findByEmail(email: string): Promise<StaffUserRecord | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) return null;
    return this.attachRoles(user);
  }

  async upsertStaffUser(input: {
    tenantId?: number;
    branchId: number;
    supabaseUserId: string;
    email: string;
    fullName: string;
    roleCode: RoleCode;
    nowIso: string;
  }): Promise<StaffUserRecord> {
    try {
      await this.db
        .insert(users)
        .values({
          tenantId: input.tenantId ?? 1,
          branchId: input.branchId,
          supabaseUserId: input.supabaseUserId,
          email: input.email,
          fullName: input.fullName,
          isActive: true,
          createdAt: input.nowIso,
          updatedAt: input.nowIso,
        })
        .onConflictDoNothing({ target: users.supabaseUserId });

      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.supabaseUserId, input.supabaseUserId))
        .limit(1);

      const [role] = await this.db
        .select()
        .from(roles)
        .where(eq(roles.code, input.roleCode))
        .limit(1);

      if (user && role) {
        await this.db
          .insert(userRoles)
          .values({
            userId: user.id,
            roleId: role.id,
            createdAt: input.nowIso,
          })
          .onConflictDoNothing();
      }

      return this.attachRoles(user!);
    } catch (error) {
      mapSqliteError(error);
    }
  }

  private async attachRoles(
    user: typeof users.$inferSelect,
  ): Promise<StaffUserRecord> {
    const assigned = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, user.id), eq(roles.isActive, true)));

    return {
      id: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId,
      supabaseUserId: user.supabaseUserId,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      isActive: user.isActive,
      roles: assigned.map((r) => r.code as RoleCode),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export class D1SystemRepository implements SystemRepository {
  constructor(
    private readonly db: ApiDatabase,
    private readonly d1: D1Database,
  ) {}

  async findIdempotency(
    operation: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null> {
    const [row] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.operation, operation),
          eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async saveIdempotency(
    input: Omit<IdempotencyRecord, "id">,
  ): Promise<IdempotencyRecord> {
    try {
      const [row] = await this.db
        .insert(idempotencyKeys)
        .values(input)
        .returning();
      return row!;
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async recordAudit(input: AuditLogInput): Promise<void> {
    await this.db.insert(auditLogs).values({
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.requestId ?? null,
      summaryJson: input.summaryJson ?? null,
      createdAt: input.nowIso,
    });
  }

  async getSetting<T = unknown>(key: string): Promise<T | null> {
    const [row] = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.settingKey, key))
      .limit(1);
    if (!row) return null;
    return JSON.parse(row.settingValueJson) as T;
  }

  async upsertSetting(input: {
    key: string;
    value: unknown;
    description?: string | null;
    updatedByUserId?: number | null;
    nowIso: string;
  }): Promise<void> {
    const json = JSON.stringify(input.value);
    await this.db
      .insert(appSettings)
      .values({
        settingKey: input.key,
        settingValueJson: json,
        description: input.description ?? null,
        updatedByUserId: input.updatedByUserId ?? null,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      })
      .onConflictDoUpdate({
        target: appSettings.settingKey,
        set: {
          settingValueJson: json,
          description: input.description ?? null,
          updatedByUserId: input.updatedByUserId ?? null,
          updatedAt: input.nowIso,
        },
      });
  }

  async ping(): Promise<{
    ok: boolean;
    latencyMs: number;
    foreignKeysEnabled: boolean;
  }> {
    const start = Date.now();
    const [selectRes, fkRes] = await this.d1.batch([
      this.d1.prepare("SELECT 1 AS ok"),
      this.d1.prepare("PRAGMA foreign_keys"),
    ]);
    const ok = Boolean((selectRes?.results?.[0] as { ok?: number } | undefined)?.ok === 1);
    const fkVal = (fkRes?.results?.[0] as { foreign_keys?: number } | undefined)?.foreign_keys;
    return {
      ok,
      latencyMs: Date.now() - start,
      foreignKeysEnabled: fkVal === 1,
    };
  }

  async getStorageMetrics(): Promise<DatabaseStorageMetrics> {
    // Cloudflare D1 restricts `PRAGMA page_count`/`PRAGMA page_size` via SQLITE_AUTH;
    // D1 exposes exact database size natively via `result.meta.size_after`.
    const [fkRes, ...countResults] = await this.d1.batch([
      this.d1.prepare("PRAGMA foreign_keys"),
      ...MONITORED_TABLES.map((tableName) =>
        this.d1.prepare(`SELECT COUNT(*) AS cnt FROM "${tableName}"`),
      ),
    ]);

    const foreignKeysEnabled =
      Number(
        (fkRes?.results?.[0] as { foreign_keys?: number } | undefined)?.foreign_keys ?? 0,
      ) === 1;

    const sizeAfter = Number(
      (fkRes?.meta as { size_after?: number } | undefined)?.size_after ?? 0,
    );
    const pageSizeBytes = 4096;
    const pageCount = sizeAfter > 0 ? Math.ceil(sizeAfter / pageSizeBytes) : 0;

    const tableCounts: Record<string, number> = {};
    MONITORED_TABLES.forEach((tableName, idx) => {
      const cnt = (countResults[idx]?.results?.[0] as { cnt?: number } | undefined)?.cnt ?? 0;
      tableCounts[tableName] = Number(cnt);
    });

    return {
      pageCount,
      pageSizeBytes,
      usedBytes: sizeAfter,
      tableCounts,
      foreignKeysEnabled,
    };
  }
}
