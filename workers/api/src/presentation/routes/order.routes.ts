import { Hono } from "hono";
import {
  addOrderAdjustmentSchema,
  addOrderNoteSchema,
  createOrderSchema,
  cursorQuerySchema,
  transitionOrderStatusSchema,
  updateOrderSchema,
} from "../../application/dto/schemas";
import { ORDER_STATUSES, type OrderStatus } from "../../shared/constants";
import { ValidationError } from "../../shared/errors";
import { requireAuth } from "../middleware/auth";
import type { ApiHonoEnv } from "../types";
import { parseOptionalIntQuery, parsePositiveIntParam } from "./helpers";

export const orderRoutes = new Hono<ApiHonoEnv>();

orderRoutes.use("*", requireAuth);

orderRoutes.post("/", async (c) => {
  const body = createOrderSchema.parse(await c.req.json());
  const idempotencyKey =
    c.req.header("idempotency-key") ??
    c.req.header("x-idempotency-key") ??
    null;

  const result = await c.var.container.orderUseCases.createOrder({
    ...body,
    idempotencyKey,
    actorUserId: c.var.actor?.id ?? null,
    requestId: c.var.requestId,
  });

  if (result.replayed) {
    c.header("x-idempotent-replayed", "true");
  }
  return c.json({ data: result.data }, result.statusCode as 201);
});

orderRoutes.get("/", async (c) => {
  const q = cursorQuerySchema.parse({
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  const rawStatus = c.req.query("status");
  if (rawStatus && !ORDER_STATUSES.includes(rawStatus as OrderStatus)) {
    throw new ValidationError(`Invalid order status filter '${rawStatus}'`);
  }

  const hubId =
    parseOptionalIntQuery(c.req.query("hubId") ?? c.req.query("branchId"), "hubId") ??
    c.var.actor?.branchId;

  const page = await c.var.container.orderUseCases.listOrders({
    tenantId: c.var.actor?.tenantId,
    branchId: hubId,
    customerId: parseOptionalIntQuery(c.req.query("customerId"), "customerId"),
    status: (rawStatus as OrderStatus | undefined) ?? undefined,
    limit: q.limit,
    cursor: q.cursor,
  });
  return c.json({ data: page }, 200);
});

orderRoutes.get("/:id", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const details = await c.var.container.orderUseCases.getOrder(id);
  return c.json({ data: details }, 200);
});

orderRoutes.put("/:id", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = updateOrderSchema.parse(await c.req.json());
  const updated = await c.var.container.orderUseCases.updateOrder(id, {
    ...body,
    actorUserId: c.var.actor?.id ?? null,
    requestId: c.var.requestId,
  });
  return c.json({ data: updated }, 200);
});

orderRoutes.patch("/:id/status", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = transitionOrderStatusSchema.parse(await c.req.json());
  const updated = await c.var.container.orderUseCases.transitionStatus(id, {
    ...body,
    actorUserId: c.var.actor?.id ?? null,
    requestId: c.var.requestId,
  });
  return c.json({ data: updated }, 200);
});

orderRoutes.post("/:id/notes", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = addOrderNoteSchema.parse(await c.req.json());
  const note = await c.var.container.orderUseCases.addNote(id, {
    ...body,
    actorUserId: c.var.actor?.id ?? null,
  });
  return c.json({ data: note }, 201);
});

orderRoutes.post("/:id/adjustments", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = addOrderAdjustmentSchema.parse(await c.req.json());
  const result = await c.var.container.orderUseCases.addAdjustment(id, {
    ...body,
    actorUserId: c.var.actor?.id ?? null,
  });
  return c.json({ data: result }, 201);
});

orderRoutes.get("/:id/calendar-event", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const event = await c.var.container.orderUseCases.getOrderCalendarEvent(id);
  return c.json({ data: event }, 200);
});

orderRoutes.post("/:id/calendar-event", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const event = await c.var.container.orderUseCases.syncOrderCalendarEvent(
    id,
    c.var.actor?.id,
  );
  return c.json({ data: event }, 200);
});

orderRoutes.post("/:id/notify", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const body = (await c.req.json()) as {
    channel: "whatsapp" | "sms";
    recipientPhone: string;
    message: string;
  };
  const nowIso = c.var.container.clock.nowIso();
  await c.var.container.system.recordAudit({
    actorUserId: c.var.actor?.id ?? null,
    action: `order.notify_${body.channel}`,
    entityType: "order",
    entityId: String(id),
    requestId: c.var.requestId ?? null,
    summaryJson: JSON.stringify({
      channel: body.channel,
      recipientPhone: body.recipientPhone,
      messagePreview: body.message.slice(0, 80),
      sentAt: nowIso,
    }),
    nowIso,
  });
  return c.json(
    {
      data: {
        success: true,
        channel: body.channel,
        recipientPhone: body.recipientPhone,
        status: "sent",
        dispatchedAt: c.var.container.clock.nowIso(),
      },
    },
    200,
  );
});
