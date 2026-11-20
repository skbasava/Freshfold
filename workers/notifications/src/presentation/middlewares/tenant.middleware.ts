import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    tenantId: number;
  }
}

export const tenantMiddleware: MiddlewareHandler = async (c, next) => {
  const headerTenant = c.req.header("x-tenant-id");
  let resolvedTenantId = 1;

  if (headerTenant) {
    const parsed = parseInt(headerTenant, 10);
    if (!isNaN(parsed) && parsed > 0) {
      resolvedTenantId = parsed;
    }
  }

  c.set("tenantId", resolvedTenantId);
  await next();
};
