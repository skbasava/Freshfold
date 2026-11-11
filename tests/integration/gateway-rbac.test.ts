import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Role } from "../../packages/contracts/src/auth";
import { requirePermission } from "../../workers/gateway/src/middleware/rbac";
import type { GatewayEnv } from "../../workers/gateway/src/types";

function appFor(role: Role) {
  const app = new Hono<GatewayEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", {
      actorId: "user-1",
      actorType: "user",
      role,
      tenantId: "tenant-1",
      hubId: "hub-1",
      exp: Date.now() + 60_000,
    });
    await next();
  });
  app.get("/reschedule", requirePermission("reschedule_order"), (c) =>
    c.text("ok"),
  );
  app.get("/orders", requirePermission("view_orders"), (c) => c.text("ok"));

  return app;
}

describe("gateway RBAC middleware", () => {
  it("allows managers and denies front desk on manager-only routes", async () => {
    const manager = await appFor("manager").request("/reschedule");
    const frontDesk = await appFor("front_desk").request("/reschedule");

    expect(manager.status).toBe(200);
    expect(frontDesk.status).toBe(403);
    expect(await frontDesk.json()).toEqual({ error: "forbidden" });
  });

  it("allows both roles to view orders but denies service identities", async () => {
    const frontDesk = await appFor("front_desk").request("/orders");
    const manager = await appFor("manager").request("/orders");
    const service = await appFor("service").request("/orders");

    expect(frontDesk.status).toBe(200);
    expect(manager.status).toBe(200);
    expect(service.status).toBe(403);
  });
});
