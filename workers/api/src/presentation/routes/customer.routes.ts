import { Hono } from "hono";
import {
  createCustomerAddressSchema,
  createCustomerSchema,
  cursorQuerySchema,
  updateCustomerSchema,
  upsertCustomerPreferencesSchema,
} from "../../application/dto/schemas";
import { requireAuth } from "../middleware/auth";
import type { ApiHonoEnv } from "../types";
import { parseOptionalIntQuery, parsePositiveIntParam } from "./helpers";

export const customerRoutes = new Hono<ApiHonoEnv>();

customerRoutes.use("*", requireAuth);

customerRoutes.post("/", async (c) => {
  const body = createCustomerSchema.parse(await c.req.json());
  const created = await c.var.container.customerUseCases.createCustomer({
    ...body,
    tenantId: c.var.actor?.tenantId,
    branchId: c.var.actor?.branchId,
    actorUserId: c.var.actor?.id ?? null,
    requestId: c.var.requestId,
  });
  return c.json({ data: created }, 201);
});

customerRoutes.get("/", async (c) => {
  const q = cursorQuerySchema.parse({
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  const hubId =
    parseOptionalIntQuery(c.req.query("hubId") ?? c.req.query("branchId"), "hubId") ??
    c.var.actor?.branchId;
  const page = await c.var.container.customerUseCases.listCustomers({
    tenantId: c.var.actor?.tenantId,
    branchId: hubId,
    search: c.req.query("search"),
    includeInactive: c.req.query("includeInactive") === "true",
    limit: q.limit,
    cursor: q.cursor,
  });
  return c.json({ data: page }, 200);
});

customerRoutes.get("/:id", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const result = await c.var.container.customerUseCases.getCustomer(id);
  return c.json({ data: result }, 200);
});

customerRoutes.patch("/:id", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = updateCustomerSchema.parse(await c.req.json());
  const updated = await c.var.container.customerUseCases.updateCustomer(id, {
    ...body,
    actorUserId: c.var.actor?.id ?? null,
    requestId: c.var.requestId,
  });
  return c.json({ data: updated }, 200);
});

customerRoutes.post("/:id/addresses", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = createCustomerAddressSchema.parse(await c.req.json());
  const created = await c.var.container.customerUseCases.addAddress(id, body);
  return c.json({ data: created }, 201);
});

customerRoutes.get("/:id/addresses", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const addresses = await c.var.container.customerUseCases.listAddresses(id);
  return c.json({ data: addresses }, 200);
});

customerRoutes.put("/:id/preferences", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = upsertCustomerPreferencesSchema.parse(await c.req.json());
  const prefs = await c.var.container.customerUseCases.upsertPreferences(id, body);
  return c.json({ data: prefs }, 200);
});
