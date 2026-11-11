import type { MiddlewareHandler } from "hono";
import { REQUEST_ID_HEADER } from "../../../../packages/contracts/src/http";
import type { GatewayEnv } from "../types";

export const requestId: MiddlewareHandler<GatewayEnv> = async (c, next) => {
  const id = crypto.randomUUID();
  c.set("requestId", id);
  c.header(REQUEST_ID_HEADER, id);
  await next();
};
