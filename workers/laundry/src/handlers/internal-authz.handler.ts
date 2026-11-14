import type { Context } from "hono";
import { can, isPermission } from "../../../../packages/domain/src/permissions";
import { hasHubAccess, type LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";

export function whoamiHandler(c: Context<LaundryEnv>) {
  return c.json(c.get("actor"));
}

export function checkAuthzHandler(c: Context<LaundryEnv>) {
  const permission = c.req.query("permission");
  const tenantId = c.req.query("tenantId");
  const hubId = c.req.query("hubId");

  if (!isPermission(permission) || !tenantId || !hubId) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const actor = c.get("actor");
  const allowed =
    can(actor.role, permission) &&
    hasHubAccess(actor, { tenantId, hubId });

  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.debug("handler_authz_checked", {
    actorId: actor.actorId,
    role: actor.role,
    permission,
    tenantId,
    hubId,
    allowed,
  });

  return c.json({ allowed }, allowed ? 200 : 403);
}

