import type { MiddlewareHandler } from "hono";
import type { Permission } from "../../../../packages/domain/src/permissions";
import { can } from "../../../../packages/domain/src/permissions";
import type { LaundryEnv } from "./context";

export function requirePermission(
  permission: Permission,
): MiddlewareHandler<LaundryEnv> {
  return async (c, next) => {
    const actor = c.get("actor");
    if (!actor || !can(actor.role, permission)) {
      return c.json({ error: "forbidden" }, 403);
    }

    await next();
  };
}
