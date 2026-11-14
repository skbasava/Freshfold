import type {
  DefaultHubProvisionInput,
  PlanTier,
  Tenant,
  TenantListResponse,
  TenantMetadata,
  TenantSettings,
  TenantStatus,
  TenantSummary,
  UpdateTenantRequest,
} from "../../../../packages/contracts/src/tenants";
import type { Logger } from "../../../../packages/shared/src/observability";
import type { ITenantRepository } from "../interfaces/tenant.interface";
import { encodeCursor, type Cursor } from "../pagination";

export type TenantRow = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  plan_tier: string | null;
  settings_json: string | null;
  metadata_json: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  version: number | null;
  created_at: number;
  updated_at: number | null;
  deleted_at: number | null;
  hub_count?: number;
};

export function mapTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? row.id,
    status: (row.status as TenantStatus) ?? "active",
    planTier: (row.plan_tier as PlanTier) ?? "standard",
    settings: row.settings_json ? safeJsonParse<TenantSettings>(row.settings_json, {}) : {},
    metadata: row.metadata_json ? safeJsonParse<TenantMetadata>(row.metadata_json, {}) : {},
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    version: row.version ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    deletedAt: row.deleted_at,
  };
}

export function mapTenantSummary(row: TenantRow): TenantSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? row.id,
    status: (row.status as TenantStatus) ?? "active",
    planTier: (row.plan_tier as PlanTier) ?? "standard",
    hubCount: row.hub_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function safeJsonParse<T>(jsonStr: string, fallback: T): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return fallback;
  }
}

const TENANT_COLUMNS = `
  id, name, slug, status, plan_tier, settings_json, metadata_json,
  contact_email, contact_phone, version, created_at, updated_at, deleted_at
`;

export class TenantRepository implements ITenantRepository {
  constructor(
    private readonly db: D1Database,
    private readonly logger?: Logger,
  ) {}

  async create(
    tenant: Tenant,
    defaultHub?: DefaultHubProvisionInput,
  ): Promise<{ tenant: Tenant; defaultHubId?: string }> {
    const start = Date.now();
    this.logger?.debug("tenant_repo_create_started", { tenantId: tenant.id });

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO tenants (
            id, name, slug, status, plan_tier, settings_json, metadata_json,
            contact_email, contact_phone, version, created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .bind(
          tenant.id,
          tenant.name,
          tenant.slug,
          tenant.status,
          tenant.planTier,
          JSON.stringify(tenant.settings ?? {}),
          JSON.stringify(tenant.metadata ?? {}),
          tenant.contactEmail ?? null,
          tenant.contactPhone ?? null,
          tenant.version,
          tenant.createdAt,
          tenant.updatedAt,
        ),
    ];

    let defaultHubId: string | undefined;
    if (defaultHub) {
      defaultHubId = `hub_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      statements.push(
        this.db
          .prepare(
            `INSERT INTO hubs (
              id, tenant_id, name, code, address, phone, timezone,
              is_active, settings_json, version, created_at, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, '{}', 1, ?, ?, NULL)`,
          )
          .bind(
            defaultHubId,
            tenant.id,
            defaultHub.name,
            defaultHub.code.toUpperCase(),
            defaultHub.address ?? null,
            defaultHub.phone ?? null,
            defaultHub.timezone ?? "Asia/Kolkata",
            tenant.createdAt,
            tenant.updatedAt,
          ),
      );
    }

    await this.db.batch(statements);

    this.logger?.info("tenant_repo_create_completed", {
      tenantId: tenant.id,
      defaultHubId,
      durationMs: Date.now() - start,
    });

    return { tenant, defaultHubId };
  }

  async getById(id: string, includeDeleted = false): Promise<Tenant | null> {
    const start = Date.now();
    this.logger?.debug("tenant_repo_get_by_id_started", { tenantId: id });

    const query = `
      SELECT ${TENANT_COLUMNS}
      FROM tenants
      WHERE id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}
    `;

    const row = await this.db.prepare(query).bind(id).first<TenantRow>();

    this.logger?.debug("tenant_repo_get_by_id_completed", {
      tenantId: id,
      found: Boolean(row),
      durationMs: Date.now() - start,
    });

    return row ? mapTenant(row) : null;
  }

  async getBySlug(slug: string, includeDeleted = false): Promise<Tenant | null> {
    const start = Date.now();
    this.logger?.debug("tenant_repo_get_by_slug_started", { slug });

    const query = `
      SELECT ${TENANT_COLUMNS}
      FROM tenants
      WHERE slug = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}
    `;

    const row = await this.db.prepare(query).bind(slug).first<TenantRow>();

    this.logger?.debug("tenant_repo_get_by_slug_completed", {
      slug,
      found: Boolean(row),
      durationMs: Date.now() - start,
    });

    return row ? mapTenant(row) : null;
  }

  async list(options: {
    limit: number;
    cursor: Cursor | null;
    status?: TenantStatus;
    includeDeleted?: boolean;
  }): Promise<TenantListResponse> {
    const start = Date.now();
    this.logger?.debug("tenant_repo_list_started", {
      limit: options.limit,
      hasCursor: Boolean(options.cursor),
      status: options.status,
    });

    const whereConditions: string[] = [];
    const bindings: Array<string | number> = [];

    if (!options.includeDeleted) {
      whereConditions.push("t.deleted_at IS NULL");
    }

    if (options.status) {
      whereConditions.push("t.status = ?");
      bindings.push(options.status);
    }

    if (options.cursor) {
      whereConditions.push("(t.created_at < ? OR (t.created_at = ? AND t.id < ?))");
      bindings.push(
        options.cursor.createdAt,
        options.cursor.createdAt,
        options.cursor.id,
      );
    }

    const whereClause =
      whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    bindings.push(options.limit + 1);

    const sql = `
      SELECT
        t.id, t.name, t.slug, t.status, t.plan_tier, t.settings_json, t.metadata_json,
        t.contact_email, t.contact_phone, t.version, t.created_at, t.updated_at, t.deleted_at,
        (SELECT COUNT(*) FROM hubs h WHERE h.tenant_id = t.id AND h.deleted_at IS NULL) AS hub_count
      FROM tenants t
      ${whereClause}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ?
    `;

    const result = await this.db.prepare(sql).bind(...bindings).all<TenantRow>();

    const hasMore = result.results.length > options.limit;
    const rows = result.results.slice(0, options.limit);
    const items = rows.map(mapTenantSummary);
    const last = items.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    this.logger?.debug("tenant_repo_list_completed", {
      count: items.length,
      hasMore,
      durationMs: Date.now() - start,
    });

    return { items, nextCursor };
  }

  async update(
    id: string,
    updates: UpdateTenantRequest,
    options: { baseVersion?: number; now?: number } = {},
  ): Promise<Tenant | null> {
    const start = Date.now();
    const now = options.now ?? Date.now();
    this.logger?.debug("tenant_repo_update_started", { tenantId: id });

    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    if (
      options.baseVersion !== undefined &&
      existing.version !== options.baseVersion
    ) {
      return null; // Version conflict
    }

    const mergedSettings = updates.settings
      ? { ...existing.settings, ...updates.settings }
      : existing.settings;

    const mergedMetadata = updates.metadata
      ? { ...existing.metadata, ...updates.metadata }
      : existing.metadata;

    const newName = updates.name ?? existing.name;
    const newSlug = updates.slug ?? existing.slug;
    const newStatus = updates.status ?? existing.status;
    const newPlanTier = updates.planTier ?? existing.planTier;
    const newContactEmail =
      updates.contactEmail !== undefined
        ? updates.contactEmail
        : existing.contactEmail;
    const newContactPhone =
      updates.contactPhone !== undefined
        ? updates.contactPhone
        : existing.contactPhone;

    const versionCheckClause =
      options.baseVersion !== undefined ? "AND version = ?" : "";
    const updateBindings: Array<string | number | null> = [
      newName,
      newSlug,
      newStatus,
      newPlanTier,
      JSON.stringify(mergedSettings),
      JSON.stringify(mergedMetadata),
      newContactEmail ?? null,
      newContactPhone ?? null,
      now,
      id,
    ];

    if (options.baseVersion !== undefined) {
      updateBindings.push(options.baseVersion);
    }

    const updateSql = `
      UPDATE tenants SET
        name = ?,
        slug = ?,
        status = ?,
        plan_tier = ?,
        settings_json = ?,
        metadata_json = ?,
        contact_email = ?,
        contact_phone = ?,
        version = version + 1,
        updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
      ${versionCheckClause}
    `;

    const res = await this.db.prepare(updateSql).bind(...updateBindings).run();

    if ((res.meta.changes ?? 0) === 0) {
      return null;
    }

    const updated = await this.getById(id);

    this.logger?.info("tenant_repo_update_completed", {
      tenantId: id,
      newVersion: updated?.version,
      durationMs: Date.now() - start,
    });

    return updated;
  }

  async softDelete(id: string, now = Date.now()): Promise<boolean> {
    const start = Date.now();
    this.logger?.debug("tenant_repo_soft_delete_started", { tenantId: id });

    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE tenants
           SET status = 'deleted', deleted_at = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .bind(now, now, id),
      this.db
        .prepare(
          `UPDATE hubs
           SET is_active = 0, updated_at = ?, deleted_at = ?
           WHERE tenant_id = ? AND deleted_at IS NULL`,
        )
        .bind(now, now, id),
    ];

    const results = await this.db.batch(statements);
    const tenantUpdated = (results[0].meta.changes ?? 0) > 0;

    this.logger?.info("tenant_repo_soft_delete_completed", {
      tenantId: id,
      tenantUpdated,
      durationMs: Date.now() - start,
    });

    return tenantUpdated;
  }
}

