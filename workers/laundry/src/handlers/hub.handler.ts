import type { Context } from "hono";
import {
  createHubRequestSchema,
  deleteHubResponseSchema,
  hubListQuerySchema,
  hubListResponseSchema,
  hubSchema,
  updateHubRequestSchema,
} from "../../../../packages/contracts/src/hubs";
import { can } from "../../../../packages/domain/src/permissions";
import type { LaundryBindings, LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";
import { decodeCursor } from "../pagination";
import { HubRepository } from "../repositories/hub.repository";
import { HubService, HubServiceError } from "../services/hub.service";

function nowMs(env: LaundryBindings): number {
  return (env.LAUNDRY_CLOCK ?? Date.now)();
}

function createHubService(c: Context<LaundryEnv>): HubService {
  const db = c.env.LAUNDRY_DB!;
  const repo = new HubRepository(
    db,
    getLaundryLogger(c.env, c.get("requestId"), "repository"),
  );
  return new HubService(
    repo,
    getLaundryLogger(c.env, c.get("requestId"), "service"),
  );
}

function isAuthorizedForTenant(
  actorRole: string,
  actorTenantId: string,
  targetTenantId: string,
): boolean {
  if (actorRole === "super_admin" || actorRole === "service") {
    return true;
  }
  return actorTenantId === targetTenantId;
}

export async function createHubHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  if (
    actor.role !== "super_admin" &&
    !can(actor.role, "manage_hubs") &&
    !can(actor.role, "manage_tenants")
  ) {
    return c.json({ error: "forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = createHubRequestSchema.safeParse(body);
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

  // Tenant ID from path param /api/tenants/:tenantId/hubs OR request body OR actor tenantId
  const tenantId =
    c.req.param("tenantId") || parsed.data.tenantId || actor.tenantId;

  if (!isAuthorizedForTenant(actor.role, actor.tenantId, tenantId)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const service = createHubService(c);
  try {
    const hub = await service.createHub(tenantId, parsed.data, {
      now: nowMs(c.env),
    });
    return c.json(hubSchema.parse(hub), 201);
  } catch (error) {
    if (error instanceof HubServiceError) {
      return c.json({ error: error.code, message: error.message }, error.status);
    }
    throw error;
  }
}

export async function listHubsHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  if (
    actor.role !== "super_admin" &&
    !can(actor.role, "view_hubs") &&
    !can(actor.role, "view_tenants")
  ) {
    return c.json({ error: "forbidden" }, 403);
  }

  const query = hubListQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  // Tenant ID from path /api/tenants/:tenantId/hubs or query param
  let targetTenantId = c.req.param("tenantId") || query.data.tenantId;

  if (actor.role !== "super_admin") {
    // Non-super_admins must only see hubs of their own tenant
    if (targetTenantId && targetTenantId !== actor.tenantId) {
      return c.json({ error: "forbidden" }, 403);
    }
    targetTenantId = actor.tenantId;
  }

  const cursor = query.data.cursor ? decodeCursor(query.data.cursor) : null;
  if (query.data.cursor && !cursor) {
    return c.json({ error: "invalid_cursor" }, 400);
  }

  const service = createHubService(c);
  const result = await service.listHubs({
    tenantId: targetTenantId,
    limit: query.data.limit,
    cursor,
    isActive: query.data.isActive,
  });

  return c.json(hubListResponseSchema.parse(result));
}

export async function getHubHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const id = c.req.param("id") ?? "";

  const service = createHubService(c);
  try {
    const hub = await service.getHub(id);

    // Fail-closed cross-tenant check: return 404 to hide resource existence
    if (!isAuthorizedForTenant(actor.role, actor.tenantId, hub.tenantId)) {
      return c.json({ error: "not_found" }, 404);
    }

    return c.json(hubSchema.parse(hub));
  } catch (error) {
    if (error instanceof HubServiceError) {
      return c.json({ error: error.code, message: error.message }, error.status);
    }
    throw error;
  }
}

export async function updateHubHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const id = c.req.param("id") ?? "";

  if (
    actor.role !== "super_admin" &&
    !can(actor.role, "manage_hubs") &&
    !can(actor.role, "manage_tenants")
  ) {
    return c.json({ error: "forbidden" }, 403);
  }

  const service = createHubService(c);
  const existing = await service.getHub(id).catch(() => null);
  if (!existing || !isAuthorizedForTenant(actor.role, actor.tenantId, existing.tenantId)) {
    return c.json({ error: "not_found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateHubRequestSchema.safeParse(body);
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

  try {
    const updated = await service.updateHub(id, parsed.data, {
      baseVersion: parsed.data.baseVersion,
      now: nowMs(c.env),
    });
    return c.json(hubSchema.parse(updated));
  } catch (error) {
    if (error instanceof HubServiceError) {
      return c.json({ error: error.code, message: error.message }, error.status);
    }
    throw error;
  }
}

export async function deleteHubHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const id = c.req.param("id") ?? "";

  if (
    actor.role !== "super_admin" &&
    !can(actor.role, "manage_hubs") &&
    !can(actor.role, "manage_tenants")
  ) {
    return c.json({ error: "forbidden" }, 403);
  }

  const service = createHubService(c);
  const existing = await service.getHub(id).catch(() => null);
  if (!existing || !isAuthorizedForTenant(actor.role, actor.tenantId, existing.tenantId)) {
    return c.json({ error: "not_found" }, 404);
  }

  const now = nowMs(c.env);
  try {
    await service.deleteHub(id, now);
    return c.json(
      deleteHubResponseSchema.parse({
        id,
        tenantId: existing.tenantId,
        status: "deleted",
        deletedAt: now,
        message: "Hub has been deactivated and soft-deleted successfully.",
      }),
    );
  } catch (error) {
    if (error instanceof HubServiceError) {
      return c.json({ error: error.code, message: error.message }, error.status);
    }
    throw error;
  }
}

