import { Hono } from "hono";
import {
  createDeliverySchema,
  cursorQuerySchema,
  transitionDeliveryStatusSchema,
} from "../../application/dto/schemas";
import { DELIVERY_STATUSES, type DeliveryStatus } from "../../shared/constants";
import { ValidationError } from "../../shared/errors";
import { requireAuth } from "../middleware/auth";
import type { ApiHonoEnv } from "../types";
import { parseOptionalIntQuery, parsePositiveIntParam } from "./helpers";

export const deliveryRoutes = new Hono<ApiHonoEnv>();

deliveryRoutes.use("/orders/:id/deliveries*", requireAuth);
deliveryRoutes.use("/deliveries*", requireAuth);

deliveryRoutes.post("/orders/:id/deliveries", async (c) => {
  const orderId = parsePositiveIntParam(c.req.param("id"));
  const body = createDeliverySchema.parse(await c.req.json());
  const created = await c.var.container.deliveryUseCases.createDelivery(orderId, {
    ...body,
    actorUserId: c.var.actor?.id ?? null,
  });
  return c.json({ data: created }, 201);
});

deliveryRoutes.get("/deliveries", async (c) => {
  const q = cursorQuerySchema.parse({
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  const rawStatus = c.req.query("status");
  if (rawStatus && !DELIVERY_STATUSES.includes(rawStatus as DeliveryStatus)) {
    throw new ValidationError(`Invalid delivery status filter '${rawStatus}'`);
  }

  const page = await c.var.container.deliveryUseCases.listDeliveries({
    orderId: parseOptionalIntQuery(c.req.query("orderId"), "orderId"),
    customerId: parseOptionalIntQuery(c.req.query("customerId"), "customerId"),
    status: (rawStatus as DeliveryStatus | undefined) ?? undefined,
    scheduledFrom: c.req.query("scheduledFrom"),
    scheduledTo: c.req.query("scheduledTo"),
    limit: q.limit,
    cursor: q.cursor,
  });
  return c.json({ data: page }, 200);
});

deliveryRoutes.get("/deliveries/slots", async (c) => {
  const rawDate = c.req.query("date");
  const date =
    (rawDate ? String(rawDate).slice(0, 10) : null) ||
    new Date().toISOString().slice(0, 10);
  const items = [
    { id: `slot-${date}-0900`, label: "09:00 – 11:00", capacity: 10, booked: 0 },
    { id: `slot-${date}-1100`, label: "11:00 – 13:00", capacity: 10, booked: 0 },
    { id: `slot-${date}-1400`, label: "14:00 – 16:00", capacity: 10, booked: 0 },
    { id: `slot-${date}-1600`, label: "16:00 – 18:00", capacity: 10, booked: 0 },
    { id: `slot-${date}-1800`, label: "18:00 – 20:00", capacity: 10, booked: 0 },
  ];
  return c.json({ data: { items }, items }, 200);
});

deliveryRoutes.get("/delivery-slots", async (c) => {
  const rawDate = c.req.query("date");
  const date =
    (rawDate ? String(rawDate).slice(0, 10) : null) ||
    new Date().toISOString().slice(0, 10);
  const items = [
    { id: `slot-${date}-0900`, label: "09:00 – 11:00", capacity: 10, booked: 0 },
    { id: `slot-${date}-1100`, label: "11:00 – 13:00", capacity: 10, booked: 0 },
    { id: `slot-${date}-1400`, label: "14:00 – 16:00", capacity: 10, booked: 0 },
    { id: `slot-${date}-1600`, label: "16:00 – 18:00", capacity: 10, booked: 0 },
    { id: `slot-${date}-1800`, label: "18:00 – 20:00", capacity: 10, booked: 0 },
  ];
  return c.json({ data: { items }, items }, 200);
});

deliveryRoutes.get("/deliveries/:id", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const delivery = await c.var.container.deliveryUseCases.getDelivery(id);
  return c.json({ data: delivery }, 200);
});

deliveryRoutes.patch("/deliveries/:id/status", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = transitionDeliveryStatusSchema.parse(await c.req.json());
  const updated = await c.var.container.deliveryUseCases.transitionStatus(id, {
    ...body,
    actorUserId: c.var.actor?.id ?? null,
  });
  return c.json({ data: updated }, 200);
});
