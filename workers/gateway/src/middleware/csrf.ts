import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
} from "../../../../packages/contracts/src/http";
import { safeEqualStrings } from "../../../../packages/shared/src/internal-context";
import type { GatewayEnv } from "../types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const requireCsrf: MiddlewareHandler<GatewayEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    return next();
  }

  const cookie = getCookie(c, CSRF_COOKIE);
  const header = c.req.header(CSRF_HEADER);

  if (!cookie || !header || !(await safeEqualStrings(cookie, header))) {
    return c.json({ error: "csrf_failed" }, 403);
  }

  return next();
};
