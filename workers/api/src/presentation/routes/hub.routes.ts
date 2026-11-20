import { Hono } from "hono";
import { z } from "zod";
import { NotFoundError } from "../../shared/errors";
import { requireAuth } from "../middleware/auth";
import type { ApiHonoEnv } from "../types";

export const hubRoutes = new Hono<ApiHonoEnv>();

hubRoutes.use("*", requireAuth);

const createHubSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric, underscore, or hyphen"),
  name: z.string().trim().min(1).max(256),
  legalName: z.string().trim().max(256).optional(),
  gstin: z.string().trim().max(15).nullable().optional(),
  stateCode: z.string().trim().length(2).default("29"),
  addressLine1: z.string().trim().optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().default("Bengaluru"),
  state: z.string().trim().default("Karnataka"),
  postalCode: z.string().trim().default("560001"),
  phone: z.string().trim().default("+919900000000"),
  email: z.string().trim().email().nullable().optional(),
});

hubRoutes.get("/", async (c) => {
  const actor = c.var.actor!;
  const list = await c.var.container.branches.findByTenantId(actor.tenantId);
  return c.json({ data: list }, 200);
});

hubRoutes.post("/", async (c) => {
  const actor = c.var.actor!;
  const body = createHubSchema.parse(await c.req.json());
  const nowIso = c.var.container.clock.nowIso();

  const created = await c.var.container.branches.create({
    tenantId: actor.tenantId,
    code: body.code.toUpperCase(),
    name: body.name,
    legalName: body.legalName ?? body.name,
    gstin: body.gstin ?? null,
    stateCode: body.stateCode,
    addressLine1: body.addressLine1 ?? "Hub Location",
    addressLine2: body.addressLine2 ?? null,
    city: body.city,
    state: body.state,
    postalCode: body.postalCode,
    phone: body.phone,
    email: body.email ?? null,
    isDefault: false,
    isActive: true,
    nowIso,
  });

  return c.json({ data: created }, 201);
});

hubRoutes.get("/:id", async (c) => {
  const rawId = c.req.param("id");
  const numId = Number(rawId);
  const branch =
    Number.isInteger(numId) && numId > 0
      ? await c.var.container.branches.findById(numId)
      : await c.var.container.branches.findByCode(rawId);

  if (!branch || branch.tenantId !== c.var.actor!.tenantId) {
    throw new NotFoundError(`Hub '${rawId}' not found`);
  }

  return c.json({ data: branch }, 200);
});
