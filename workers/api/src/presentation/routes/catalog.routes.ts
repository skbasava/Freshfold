import { Hono } from "hono";
import {
  createCategorySchema,
  createItemSchema,
  createServiceSchema,
  cursorQuerySchema,
  setItemAttributeSchema,
  updateItemSchema,
} from "../../application/dto/schemas";
import { requireAuth } from "../middleware/auth";
import type { ApiHonoEnv } from "../types";
import { parseOptionalIntQuery, parsePositiveIntParam } from "./helpers";

export const catalogRoutes = new Hono<ApiHonoEnv>();

catalogRoutes.use("/item-categories*", requireAuth);
catalogRoutes.use("/items*", requireAuth);
catalogRoutes.use("/service-categories*", requireAuth);
catalogRoutes.use("/services*", requireAuth);

/* Item Categories */
catalogRoutes.get("/item-categories", async (c) => {
  const includeInactive = c.req.query("includeInactive") === "true";
  const rows = await c.var.container.catalogUseCases.listItemCategories(
    includeInactive,
  );
  return c.json({ data: rows }, 200);
});

catalogRoutes.post("/item-categories", async (c) => {
  const body = createCategorySchema.parse(await c.req.json());
  const created = await c.var.container.catalogUseCases.createItemCategory(body);
  return c.json({ data: created }, 201);
});

/* Items + Attributes + R2 Image Upload/Download */
catalogRoutes.get("/items", async (c) => {
  const q = cursorQuerySchema.parse({
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  const page = await c.var.container.catalogUseCases.listItems({
    categoryId: parseOptionalIntQuery(c.req.query("categoryId"), "categoryId"),
    search: c.req.query("search"),
    includeInactive: c.req.query("includeInactive") === "true",
    limit: q.limit,
    cursor: q.cursor,
  });
  return c.json({ data: page }, 200);
});

catalogRoutes.post("/items", async (c) => {
  const body = createItemSchema.parse(await c.req.json());
  const created = await c.var.container.catalogUseCases.createItem(body);
  return c.json({ data: created }, 201);
});

catalogRoutes.patch("/items/:id", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = updateItemSchema.parse(await c.req.json());
  const updated = await c.var.container.catalogUseCases.updateItem(id, body);
  return c.json({ data: updated }, 200);
});

catalogRoutes.put("/items/:id/attributes", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = setItemAttributeSchema.parse(await c.req.json());
  const attr = await c.var.container.catalogUseCases.setItemAttribute(id, body);
  return c.json({ data: attr }, 200);
});

catalogRoutes.put("/items/:id/image", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const contentType = c.req.header("content-type")?.split(";")[0]?.trim() ?? "";
  const bytes = await c.req.arrayBuffer();
  const updated = await c.var.container.catalogUseCases.uploadItemImage({
    itemId: id,
    contentType,
    bytes,
  });
  return c.json({ data: updated }, 200);
});

catalogRoutes.get("/items/:id/image", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const obj = await c.var.container.catalogUseCases.downloadItemImage(id);
  return new Response(obj.body, {
    status: 200,
    headers: {
      "content-type": obj.contentType,
      "content-length": String(obj.sizeBytes),
      "cache-control": "private, max-age=3600",
    },
  });
});

/* Service Categories & Services */
catalogRoutes.get("/service-categories", async (c) => {
  const includeInactive = c.req.query("includeInactive") === "true";
  const rows = await c.var.container.catalogUseCases.listServiceCategories(
    includeInactive,
  );
  return c.json({ data: rows }, 200);
});

catalogRoutes.post("/service-categories", async (c) => {
  const body = createCategorySchema.parse(await c.req.json());
  const created = await c.var.container.catalogUseCases.createServiceCategory(body);
  return c.json({ data: created }, 201);
});

catalogRoutes.get("/services", async (c) => {
  const rows = await c.var.container.catalogUseCases.listServices({
    categoryId: parseOptionalIntQuery(c.req.query("categoryId"), "categoryId"),
    includeInactive: c.req.query("includeInactive") === "true",
  });
  return c.json({ data: rows }, 200);
});

catalogRoutes.post("/services", async (c) => {
  const body = createServiceSchema.parse(await c.req.json());
  const created = await c.var.container.catalogUseCases.createService(body);
  return c.json({ data: created }, 201);
});
