import type { Context } from "hono";
import {
  createTenantRequestSchema,
  deleteTenantResponseSchema,
  tenantListQuerySchema,
  tenantListResponseSchema,
  tenantSchema,
  updateTenantRequestSchema,
} from "../../../../packages/contracts/src/tenants";
import { can } from "../../../../packages/domain/src/permissions";
import type { LaundryBindings, LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";
import { decodeCursor } from "../pagination";
import { TenantRepository } from "../repositories/tenant.repository";
import { TenantService, TenantServiceError } from "../services/tenant.service";

function nowMs(env: LaundryBindings): number {
  return (env.LAUNDRY_CLOCK ?? Date.now)();
}

function createTenantService(c: Context<LaundryEnv>): TenantService {
  const db = c.env.LAUNDRY_DB!;
  const repo = new TenantRepository(
    db,
    getLaundryLogger(c.env, c.get("requestId"), "repository"),
  );
  return new TenantService(
    repo,
    getLaundryLogger(c.env, c.get("requestId"), "service"),
  );
}

function isAuthorizedForTenant(
  actorRole: string,
  actorTenantId: string,
  targetTenantId: string,
): boolean {
  if (actorRole === "super_admin") {
    return true;
  }
  return actorTenantId === targetTenantId;
}

export async function createTenantHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  if (actor.role !== "super_admin" && actor.role !== "owner" && actor.role !== "service") {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = createTenantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "INVALID_REQUEST",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  const service = createTenantService(c);
  try {
    const result = await service.createTenant(parsed.data, {
      now: nowMs(c.env),
    });
    return c.json(
      {
        ...tenantSchema.parse(result.tenant),
        defaultHubId: result.defaultHubId,
      },
      201,
    );
  } catch (error) {
    if (error instanceof TenantServiceError) {
      return c.json({ error: error.code, message: error.message }, error.status);
    }
    throw error;
  }
}

export async function listTenantsHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  if (actor.role !== "super_admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const query = tenantListQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const cursor = query.data.cursor ? decodeCursor(query.data.cursor) : null;
  if (query.data.cursor && !cursor) {
    return c.json({ error: "invalid_cursor" }, 400);
  }

  const service = createTenantService(c);
  const result = await service.listTenants({
    limit: query.data.limit,
    cursor,
    status: query.data.status,
  });

  return c.json(tenantListResponseSchema.parse(result));
}

export async function getTenantHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const id = c.req.param("id") ?? "";

  // Fail-closed tenant boundary: return 404 to hide resource existence across tenants
  if (!isAuthorizedForTenant(actor.role, actor.tenantId, id)) {
    return c.json({ error: "not_found" }, 404);
  }

  const service = createTenantService(c);
  try {
    const tenant = await service.getTenant(id);
    return c.json(tenantSchema.parse(tenant));
  } catch (error) {
    if (error instanceof TenantServiceError) {
      return c.json({ error: error.code, message: error.message }, error.status);
    }
    throw error;
  }
}

export async function updateTenantHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const id = c.req.param("id") ?? "";

  if (!isAuthorizedForTenant(actor.role, actor.tenantId, id)) {
    return c.json({ error: "not_found" }, 404);
  }

  if (actor.role !== "super_admin" && !can(actor.role, "manage_tenants")) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateTenantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "INVALID_REQUEST",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  const service = createTenantService(c);
  try {
    const updated = await service.updateTenant(id, parsed.data, {
      baseVersion: parsed.data.baseVersion,
      now: nowMs(c.env),
    });
    return c.json(tenantSchema.parse(updated));
  } catch (error) {
    if (error instanceof TenantServiceError) {
      return c.json({ error: error.code, message: error.message }, error.status);
    }
    throw error;
  }
}

export async function deleteTenantHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const id = c.req.param("id") ?? "";

  if (!isAuthorizedForTenant(actor.role, actor.tenantId, id)) {
    return c.json({ error: "not_found" }, 404);
  }

  if (actor.role !== "super_admin" && !can(actor.role, "manage_tenants")) {
    return c.json({ error: "forbidden" }, 403);
  }

  const service = createTenantService(c);
  const now = nowMs(c.env);

  try {
    await service.deleteTenant(id, now);
    return c.json(
      deleteTenantResponseSchema.parse({
        id,
        status: "deleted",
        deletedAt: now,
        message: "Tenant has been deactivated and soft-deleted successfully.",
      }),
    );
  } catch (error) {
    if (error instanceof TenantServiceError) {
      return c.json({ error: error.code, message: error.message }, error.status);
    }
    throw error;
  }
}

