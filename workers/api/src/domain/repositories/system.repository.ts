import type { RoleCode } from "../../shared/constants";

export interface StaffUserRecord {
  id: number;
  branchId: number;
  supabaseUserId: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  roles: RoleCode[];
  createdAt: string;
  updatedAt: string;
}

export interface IdempotencyRecord {
  id: number;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  responseStatus: number;
  responseBodyJson: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuditLogInput {
  actorUserId?: number | null;
  action: string;
  entityType: string;
  entityId: string;
  requestId?: string | null;
  summaryJson?: string | null;
  nowIso: string;
}

export interface DatabaseStorageMetrics {
  pageCount: number;
  pageSizeBytes: number;
  usedBytes: number;
  tableCounts: Record<string, number>;
  foreignKeysEnabled: boolean;
}

export interface AccessRepository {
  findBySupabaseUserId(supabaseUserId: string): Promise<StaffUserRecord | null>;
  findByEmail(email: string): Promise<StaffUserRecord | null>;
  upsertStaffUser(input: {
    branchId: number;
    supabaseUserId: string;
    email: string;
    fullName: string;
    roleCode: RoleCode;
    nowIso: string;
  }): Promise<StaffUserRecord>;
}

export interface SystemRepository {
  findIdempotency(
    operation: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | null>;
  saveIdempotency(input: Omit<IdempotencyRecord, "id">): Promise<IdempotencyRecord>;
  recordAudit(input: AuditLogInput): Promise<void>;
  getSetting<T = unknown>(key: string): Promise<T | null>;
  upsertSetting(input: {
    key: string;
    value: unknown;
    description?: string | null;
    updatedByUserId?: number | null;
    nowIso: string;
  }): Promise<void>;
  ping(): Promise<{ ok: boolean; latencyMs: number; foreignKeysEnabled: boolean }>;
  getStorageMetrics(): Promise<DatabaseStorageMetrics>;
}
