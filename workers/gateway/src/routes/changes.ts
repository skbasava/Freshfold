import { Hono } from "hono";
import { requireSession } from "../auth/session";
import { forwardToLaundry } from "../middleware/forward";
import { requirePermission } from "../middleware/rbac";
import { signedContext } from "../middleware/signed-context";
import type { GatewayEnv } from "../types";

const reads = new Hono<GatewayEnv>();

for (const path of ["/changes", "/orders/:id/events"]) {
  reads.get(
    path,
    requireSession,
    requirePermission("view_orders"),
    signedContext,
    forwardToLaundry,
  );
}

export default reads;
