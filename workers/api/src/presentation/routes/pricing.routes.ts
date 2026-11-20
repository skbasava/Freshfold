import { Hono } from "hono";
import {
  addRateCardItemSchema,
  assignCustomerRateCardSchema,
  createRateCardSchema,
  createTaxRateSchema,
  pricingQuoteSchema,
} from "../../application/dto/schemas";
import { ValidationError } from "../../shared/errors";
import { requireAuth } from "../middleware/auth";
import type { ApiHonoEnv } from "../types";
import { parseOptionalIntQuery, parsePositiveIntParam } from "./helpers";

export const pricingRoutes = new Hono<ApiHonoEnv>();

pricingRoutes.use("/tax-rates*", requireAuth);
pricingRoutes.use("/rate-cards*", requireAuth);
pricingRoutes.use("/customers/:id/rate-cards*", requireAuth);
pricingRoutes.use("/pricing*", requireAuth);
pricingRoutes.use("/settings*", requireAuth);

/* Tax Rates */
pricingRoutes.get("/tax-rates", async (c) => {
  const activeOnly = c.req.query("activeOnly") !== "false";
  const rows = await c.var.container.pricingUseCases.listTaxRates(activeOnly);
  return c.json({ data: rows }, 200);
});

pricingRoutes.post("/tax-rates", async (c) => {
  const body = createTaxRateSchema.parse(await c.req.json());
  const created = await c.var.container.pricingUseCases.createTaxRate(body);
  return c.json({ data: created }, 201);
});

/* Rate Cards & Items */
pricingRoutes.get("/rate-cards", async (c) => {
  const hubId =
    parseOptionalIntQuery(c.req.query("hubId") ?? c.req.query("branchId"), "hubId") ??
    c.var.actor?.branchId;
  const rows = await c.var.container.pricingUseCases.listRateCards(
    hubId,
    c.var.actor?.tenantId,
  );
  return c.json({ data: rows }, 200);
});

pricingRoutes.get("/rate-cards/current/items", async (c) => {
  const hubId =
    parseOptionalIntQuery(c.req.query("hubId") ?? c.req.query("branchId"), "hubId") ??
    c.var.actor?.branchId;
  if (!hubId) {
    throw new ValidationError("No active hub found");
  }
  const defaultCard = await c.var.container.pricingUseCases.getDefaultRateCardForBranch(hubId);
  const rows = await c.var.container.pricingUseCases.listRateCardItems(defaultCard.id);
  return c.json({ data: rows, rateCard: defaultCard }, 200);
});

pricingRoutes.post("/rate-cards", async (c) => {
  const body = createRateCardSchema.parse(await c.req.json());
  const created = await c.var.container.pricingUseCases.createRateCard(body);
  return c.json({ data: created }, 201);
});

pricingRoutes.get("/rate-cards/:id/items", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const rows = await c.var.container.pricingUseCases.listRateCardItems(id);
  return c.json({ data: rows }, 200);
});

pricingRoutes.post("/rate-cards/:id/items", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = addRateCardItemSchema.parse(await c.req.json());
  const created = await c.var.container.pricingUseCases.addRateCardItem(id, body);
  return c.json({ data: created }, 201);
});

pricingRoutes.put("/rate-cards/:id/items", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = addRateCardItemSchema.parse(await c.req.json());
  const upserted = await c.var.container.pricingUseCases.upsertRateCardItem(id, body);
  return c.json({ data: upserted }, 200);
});

pricingRoutes.post("/customers/:id/rate-cards", async (c) => {
  const customerId = parsePositiveIntParam(c.req.param("id"));
  const body = assignCustomerRateCardSchema.parse(await c.req.json());
  const assigned = await c.var.container.pricingUseCases.assignCustomerRateCard(
    customerId,
    body,
  );
  return c.json({ data: assigned }, 201);
});

/* Deterministic Pricing & GST Quote */
pricingRoutes.post("/pricing/quote", async (c) => {
  const body = pricingQuoteSchema.parse(await c.req.json());
  const quote = await c.var.container.pricingUseCases.calculateQuote(body);
  return c.json({ data: quote }, 200);
});

/* App Settings: Indian GST Configuration */
pricingRoutes.get("/settings/gst", async (c) => {
  const config = await c.var.container.pricingUseCases.getGstConfig();
  return c.json({ data: config }, 200);
});

pricingRoutes.put("/settings/gst", async (c) => {
  const body = (await c.req.json()) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") {
    throw new ValidationError("Field 'enabled' (boolean) is required");
  }
  const config = await c.var.container.pricingUseCases.setGstConfig(
    body.enabled,
    c.var.actor?.id,
  );
  return c.json({ data: config }, 200);
});

pricingRoutes.patch("/settings/gst", async (c) => {
  const body = (await c.req.json()) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") {
    throw new ValidationError("Field 'enabled' (boolean) is required");
  }
  const config = await c.var.container.pricingUseCases.setGstConfig(
    body.enabled,
    c.var.actor?.id,
  );
  return c.json({ data: config }, 200);
});
