import type {
  Hub,
  HubListResponse,
  HubMetadata,
  HubSettings,
  HubSummary,
  UpdateHubRequest,
} from "../../../../packages/contracts/src/hubs";
import type { Logger } from "../../../../packages/shared/src/observability";
import type { IHubRepository } from "../interfaces/hub.interface";
import { encodeCursor, type Cursor } from "../pagination";

export type HubRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  timezone: string | null;
  is_active: number | null;
  settings_json: string | null;
  metadata_json: string | null;
  version: number | null;
  created_at: number;
  updated_at: number | null;
  deleted_at: number | null;
};

export function mapHub(row: HubRow): Hub {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    code: row.code ?? row.id,
    address: row.address,
    phone: row.phone,
    timezone: row.timezone ?? "Asia/Kolkata",
    isActive: (row.is_active ?? 1) === 1,
    settings: row.settings_json ? safeJsonParse<HubSettings>(row.settings_json, {}) : {},
    metadata: row.metadata_json ? safeJsonParse<HubMetadata>(row.metadata_json, {}) : {},
    version: row.version ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    deletedAt: row.deleted_at,
  };
}

export function mapHubSummary(row: HubRow): HubSummary {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    code: row.code ?? row.id,
    address: row.address,
    phone: row.phone,
    timezone: row.timezone ?? "Asia/Kolkata",
    isActive: (row.is_active ?? 1) === 1,
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

const HUB_COLUMNS = `
  id, tenant_id, name, code, address, phone, timezone,
  is_active, settings_json, metadata_json, version, created_at, updated_at, deleted_at
`;

export class HubRepository implements IHubRepository {
  constructor(
    private readonly db: D1Database,
    private readonly logger?: Logger,
  ) {}

  async create(hub: Hub): Promise<Hub> {
    const start = Date.now();
    this.logger?.debug("hub_repo_create_started", {
      hubId: hub.id,
      tenantId: hub.tenantId,
      code: hub.code,
    });

    await this.db
      .prepare(
        `INSERT INTO hubs (
          id, tenant_id, name, code, address, phone, timezone,
          is_active, settings_json, metadata_json, version, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        hub.id,
        hub.tenantId,
        hub.name,
        hub.code.toUpperCase(),
        hub.address ?? null,
        hub.phone ?? null,
        hub.timezone,
        hub.isActive ? 1 : 0,
        JSON.stringify(hub.settings ?? {}),
        JSON.stringify(hub.metadata ?? {}),
        hub.version,
        hub.createdAt,
        hub.updatedAt,
      )
      .run();

    this.logger?.info("hub_repo_create_completed", {
      hubId: hub.id,
      tenantId: hub.tenantId,
      durationMs: Date.now() - start,
    });

    return hub;
  }

  async getById(id: string, includeDeleted = false): Promise<Hub | null> {
    const start = Date.now();
    this.logger?.debug("hub_repo_get_by_id_started", { hubId: id });

    const query = `
      SELECT ${HUB_COLUMNS}
      FROM hubs
      WHERE id = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}
    `;

    const row = await this.db.prepare(query).bind(id).first<HubRow>();

    this.logger?.debug("hub_repo_get_by_id_completed", {
      hubId: id,
      found: Boolean(row),
      durationMs: Date.now() - start,
    });

    return row ? mapHub(row) : null;
  }

  async getByCode(
    tenantId: string,
    code: string,
    includeDeleted = false,
  ): Promise<Hub | null> {
    const start = Date.now();
    this.logger?.debug("hub_repo_get_by_code_started", { tenantId, code });

    const query = `
      SELECT ${HUB_COLUMNS}
      FROM hubs
      WHERE tenant_id = ? AND UPPER(code) = ? ${includeDeleted ? "" : "AND deleted_at IS NULL"}
    `;

    const row = await this.db
      .prepare(query)
      .bind(tenantId, code.toUpperCase())
      .first<HubRow>();

    this.logger?.debug("hub_repo_get_by_code_completed", {
      tenantId,
      code,
      found: Boolean(row),
      durationMs: Date.now() - start,
    });

    return row ? mapHub(row) : null;
  }

  async list(options: {
    tenantId?: string;
    limit: number;
    cursor: Cursor | null;
    isActive?: boolean;
    includeDeleted?: boolean;
  }): Promise<HubListResponse> {
    const start = Date.now();
    this.logger?.debug("hub_repo_list_started", {
      tenantId: options.tenantId,
      limit: options.limit,
      hasCursor: Boolean(options.cursor),
      isActive: options.isActive,
    });

    const whereConditions: string[] = [];
    const bindings: Array<string | number> = [];

    if (!options.includeDeleted) {
      whereConditions.push("deleted_at IS NULL");
    }

    if (options.tenantId) {
      whereConditions.push("tenant_id = ?");
      bindings.push(options.tenantId);
    }

    if (options.isActive !== undefined) {
      whereConditions.push("is_active = ?");
      bindings.push(options.isActive ? 1 : 0);
    }

    if (options.cursor) {
      whereConditions.push("(created_at < ? OR (created_at = ? AND id < ?))");
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
      SELECT ${HUB_COLUMNS}
      FROM hubs
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `;

    const result = await this.db.prepare(sql).bind(...bindings).all<HubRow>();

    const hasMore = result.results.length > options.limit;
    const rows = result.results.slice(0, options.limit);
    const items = rows.map(mapHubSummary);
    const last = items.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    this.logger?.debug("hub_repo_list_completed", {
      count: items.length,
      hasMore,
      durationMs: Date.now() - start,
    });

    return { items, nextCursor };
  }

  async update(
    id: string,
    updates: UpdateHubRequest,
    options: { baseVersion?: number; now?: number } = {},
  ): Promise<Hub | null> {
    const start = Date.now();
    const now = options.now ?? Date.now();
    this.logger?.debug("hub_repo_update_started", { hubId: id });

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
    const newCode = updates.code ? updates.code.toUpperCase() : existing.code;
    const newAddress =
      updates.address !== undefined ? updates.address : existing.address;
    const newPhone = updates.phone !== undefined ? updates.phone : existing.phone;
    const newTimezone = updates.timezone ?? existing.timezone;
    const newIsActive =
      updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : existing.isActive ? 1 : 0;

    const versionCheckClause =
      options.baseVersion !== undefined ? "AND version = ?" : "";
    const updateBindings: Array<string | number | null> = [
      newName,
      newCode,
      newAddress ?? null,
      newPhone ?? null,
      newTimezone,
      newIsActive,
      JSON.stringify(mergedSettings),
      JSON.stringify(mergedMetadata),
      now,
      id,
    ];

    if (options.baseVersion !== undefined) {
      updateBindings.push(options.baseVersion);
    }

    const updateSql = `
      UPDATE hubs SET
        name = ?,
        code = ?,
        address = ?,
        phone = ?,
        timezone = ?,
        is_active = ?,
        settings_json = ?,
        metadata_json = ?,
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

    this.logger?.info("hub_repo_update_completed", {
      hubId: id,
      newVersion: updated?.version,
      durationMs: Date.now() - start,
    });

    return updated;
  }

  async softDelete(id: string, now = Date.now()): Promise<boolean> {
    const start = Date.now();
    this.logger?.debug("hub_repo_soft_delete_started", { hubId: id });

    const result = await this.db
      .prepare(
        `UPDATE hubs
         SET is_active = 0, deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(now, now, id)
      .run();

    const changed = (result.meta.changes ?? 0) > 0;

    this.logger?.info("hub_repo_soft_delete_completed", {
      hubId: id,
      changed,
      durationMs: Date.now() - start,
    });

    return changed;
  }
}

