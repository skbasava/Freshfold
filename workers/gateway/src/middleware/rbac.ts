import type { MiddlewareHandler } from "hono";
import type { Permission } from "../../../../packages/domain/src/permissions";
import { can } from "../../../../packages/domain/src/permissions";
import { errorResponse } from "./errors";
import type { GatewayEnv } from "../types";

export function requirePermission(
  permission: Permission,
): MiddlewareHandler<GatewayEnv> {
  return async (c, next) => {
    const auth = c.get("auth");
    if (!auth || !can(auth.role, permission)) {
      return errorResponse(c, 403, "forbidden");
    }

    await next();
  };
}
