import type { Context } from "hono";
import type { LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";

export async function realtimeHandler(c: Context<LaundryEnv>) {
  const doNamespace = c.env.TENANT_REALTIME;
  if (!doNamespace) {
    return c.json({ error: "realtime_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const id = doNamespace.idFromName(actor.tenantId);
  const stub = doNamespace.get(id);

  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.debug("handler_realtime_forwarding", {
    tenantId: actor.tenantId,
    hubId: actor.hubId,
    actorId: actor.actorId,
  });

  const url = new URL(c.req.url);
  url.searchParams.set("tenantId", actor.tenantId);
  if (actor.hubId) url.searchParams.set("branchId", actor.hubId);
  url.searchParams.set("userId", actor.actorId);

  const forwardRequest = new Request(url.toString(), c.req.raw);
  return stub.fetch(forwardRequest);
}

