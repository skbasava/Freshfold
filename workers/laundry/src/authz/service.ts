import type { MiddlewareHandler } from "hono";
import {
  SERVICE_NAME_HEADER,
  SERVICE_TOKEN_HEADER,
} from "../../../../packages/contracts/src/http";
import { safeEqualStrings } from "../../../../packages/shared/src/internal-context";
import type { LaundryEnv } from "./context";

export const INTERNAL_SERVICE_NAMES = [
  "calendar",
  "notifications",
  "scheduler",
  "gateway",
] as const;
export type InternalServiceName = (typeof INTERNAL_SERVICE_NAMES)[number];

export async function resolveServiceIdentity(
  request: Request,
  env: { SERVICE_TOKEN?: string },
  allowed: readonly InternalServiceName[],
): Promise<InternalServiceName | null> {
  const serviceToken = request.headers.get(SERVICE_TOKEN_HEADER);
  const serviceName = request.headers.get(SERVICE_NAME_HEADER);

  if (!serviceToken || !serviceName || !env.SERVICE_TOKEN) {
    return null;
  }

  if (!allowed.includes(serviceName as InternalServiceName)) {
    return null;
  }

  if (!(await safeEqualStrings(serviceToken, env.SERVICE_TOKEN))) {
    return null;
  }

  return serviceName as InternalServiceName;
}

export function requireService(
  allowed: readonly InternalServiceName[],
): MiddlewareHandler<LaundryEnv> {
  return async (c, next) => {
    const service = await resolveServiceIdentity(c.req.raw, c.env, allowed);
    if (!service) {
      return c.json({ error: "unauthorized" }, 401);
    }

    await next();
  };
}
