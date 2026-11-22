import { Hono, type Context } from "hono";
import {
  addOrderAdjustmentSchema,
  addOrderNoteSchema,
  createOrderSchema,
  cursorQuerySchema,
  transitionOrderStatusSchema,
  updateOrderSchema,
} from "../../application/dto/schemas";
import { ORDER_STATUSES, type OrderStatus } from "../../shared/constants";
import { ForbiddenError, ValidationError } from "../../shared/errors";
import { requireAuth } from "../middleware/auth";
import type { ApiHonoEnv } from "../types";
import { parseOptionalIntQuery, parsePositiveIntParam } from "./helpers";

export const orderRoutes = new Hono<ApiHonoEnv>();

orderRoutes.use("*", requireAuth);

/**
 * Resolves and validates tenant and hub scoping parameters from HTTP request headers
 * (`x-tenant-id`, `x-hub-id`) and the authenticated staff actor session context.
 *
 * Enforces strict multi-tenant and multi-hub isolation:
 * 1. If `x-tenant-id` header is present, validates it is a positive integer and verifies that it
 *    matches the authenticated staff user's authorized tenant (blocking cross-tenant access attempts).
 * 2. If `x-hub-id` header is present, validates it is a positive integer.
 * 3. Falls back safely to the verified actor session's tenantId and branchId if headers are not provided.
 */
export function resolveOrderScope(c: Context<ApiHonoEnv>): {
  tenantId: number;
  branchId: number;
} {
  const actor = c.var.actor;
  const rawTenantHeader = c.req.header("x-tenant-id")?.trim();
  const rawHubHeader = c.req.header("x-hub-id")?.trim();

  let tenantId: number;
  if (rawTenantHeader !== undefined && rawTenantHeader !== "") {
    const parsed = Number(rawTenantHeader);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new ValidationError("Header 'x-tenant-id' must be a positive integer");
    }
    if (actor?.tenantId && actor.tenantId !== parsed) {
      throw new ForbiddenError("Access denied: unauthorized tenant");
    }
    tenantId = parsed;
  } else {
    tenantId = actor?.tenantId ?? 1;
  }

  let branchId: number;
  if (rawHubHeader !== undefined && rawHubHeader !== "") {
    const parsed = Number(rawHubHeader);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new ValidationError("Header 'x-hub-id' must be a positive integer");
    }
    branchId = parsed;
  } else {
    branchId = actor?.branchId ?? 1;
  }

  return { tenantId, branchId };
}

orderRoutes.post("/", async (c) => {
  const body = createOrderSchema.parse(await c.req.json());
  const { tenantId, branchId } = resolveOrderScope(c);
  const idempotencyKey =
    c.req.header("idempotency-key") ??
    c.req.header("x-idempotency-key") ??
    null;

  const result = await c.var.container.orderUseCases.createOrder({
    ...body,
    tenantId,
    branchId,
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

  const { tenantId, branchId } = resolveOrderScope(c);

  const queryHubId = parseOptionalIntQuery(
    c.req.query("hubId") ?? c.req.query("branchId"),
    "hubId",
  );

  const rawHubHeader = c.req.header("x-hub-id")?.trim();
  if (rawHubHeader && queryHubId !== undefined && queryHubId !== branchId) {
    throw new ForbiddenError("Query parameter 'hubId' does not match 'x-hub-id' header");
  }

  const effectiveHubId = queryHubId ?? branchId;

  const page = await c.var.container.orderUseCases.listOrders({
    tenantId,
    branchId: effectiveHubId,
    customerId: parseOptionalIntQuery(c.req.query("customerId"), "customerId"),
    status: (rawStatus as OrderStatus | undefined) ?? undefined,
    limit: q.limit,
    cursor: q.cursor,
  });
  return c.json({ data: page }, 200);
});

orderRoutes.get("/:id", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const { tenantId, branchId } = resolveOrderScope(c);
  const details = await c.var.container.orderUseCases.getOrder(id, {
    tenantId,
    branchId,
  });
  return c.json({ data: details }, 200);
});

orderRoutes.put("/:id", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const { tenantId, branchId } = resolveOrderScope(c);
  const body = updateOrderSchema.parse(await c.req.json());
  const updated = await c.var.container.orderUseCases.updateOrder(
    id,
    {
      ...body,
      actorUserId: c.var.actor?.id ?? null,
      requestId: c.var.requestId,
    },
    { tenantId, branchId },
  );
  return c.json({ data: updated }, 200);
});

orderRoutes.patch("/:id/status", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const { tenantId, branchId } = resolveOrderScope(c);
  const body = transitionOrderStatusSchema.parse(await c.req.json());
  const updated = await c.var.container.orderUseCases.transitionStatus(
    id,
    {
      ...body,
      actorUserId: c.var.actor?.id ?? null,
      requestId: c.var.requestId,
    },
    { tenantId, branchId },
  );
  return c.json({ data: updated }, 200);
});

orderRoutes.post("/:id/notes", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const { tenantId, branchId } = resolveOrderScope(c);
  const body = addOrderNoteSchema.parse(await c.req.json());
  const note = await c.var.container.orderUseCases.addNote(
    id,
    {
      ...body,
      actorUserId: c.var.actor?.id ?? null,
    },
    { tenantId, branchId },
  );
  return c.json({ data: note }, 201);
});

orderRoutes.post("/:id/adjustments", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const { tenantId, branchId } = resolveOrderScope(c);
  const body = addOrderAdjustmentSchema.parse(await c.req.json());
  const result = await c.var.container.orderUseCases.addAdjustment(
    id,
    {
      ...body,
      actorUserId: c.var.actor?.id ?? null,
    },
    { tenantId, branchId },
  );
  return c.json({ data: result }, 201);
});

orderRoutes.get("/:id/calendar-event", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const { tenantId, branchId } = resolveOrderScope(c);
  const event = await c.var.container.orderUseCases.getOrderCalendarEvent(id, {
    tenantId,
    branchId,
  });
  return c.json({ data: event }, 200);
});

orderRoutes.post("/:id/calendar-event", async (c) => {
  const id = parsePositiveIntParam(c.req.param("id"));
  const { tenantId, branchId } = resolveOrderScope(c);
  const event = await c.var.container.orderUseCases.syncOrderCalendarEvent(
    id,
    c.var.actor?.id,
    { tenantId, branchId },
  );
  return c.json({ data: event }, 200);
});
