import type { Context } from "hono";
import {
  orderDetailSchema,
  orderListResponseSchema,
} from "../../../../packages/contracts/src/orders";
import {
  orderEventsQuerySchema,
  orderEventsResponseSchema,
} from "../../../../packages/contracts/src/changes";
import {
  applyChangeInputSchema,
  createOrderPayloadSchema,
} from "../../../../packages/contracts/src/mutations";
import type { LaundryBindings, LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";
import { parseListQuery } from "../pagination";
import { OrderRepository } from "../repositories/order.repository";
import { ApplyChangeError, OrderService } from "../services/order.service";

function nowMs(env: LaundryBindings): number {
  return (env.LAUNDRY_CLOCK ?? Date.now)();
}

function createOrderService(c: Context<LaundryEnv>): OrderService {
  const db = c.env.LAUNDRY_DB!;
  const repo = new OrderRepository(
    db,
    getLaundryLogger(c.env, c.get("requestId"), "repository"),
  );
  return new OrderService(
    repo,
    db,
    getLaundryLogger(c.env, c.get("requestId"), "service"),
    c.env.ORDER_STATE_KV,
  );
}

export async function listOrdersHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const query = parseListQuery(c.req.query());
  if (!query) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const actor = c.get("actor");
  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.debug("handler_list_orders", { hubId: actor.hubId, query });

  const service = createOrderService(c);
  const result = await service.listOrders(
    actor.hubId,
    {
      limit: query.limit,
      cursor: query.cursor ?? null,
    },
    actor.tenantId,
  );

  return c.json(orderListResponseSchema.parse(result));
}

export async function getOrderHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const id = c.req.param("id") ?? "";
  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.debug("handler_get_order", { hubId: actor.hubId, orderId: id, tenantId: actor.tenantId });

  const service = createOrderService(c);
  const order = await service.getOrder(actor.hubId, id, actor.tenantId);
  if (!order) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(orderDetailSchema.parse(order));
}

export async function getInternalOrderHandler(c: Context<LaundryEnv>) {
  const actor = c.get("actor");
  if (actor.actorType !== "service" && actor.actorType !== "system") {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const id = c.req.param("id") ?? "";
  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.debug("handler_get_internal_order", { hubId: actor.hubId, orderId: id, tenantId: actor.tenantId });

  const service = createOrderService(c);
  const order = await service.getOrder(actor.hubId, id, actor.tenantId);
  if (!order) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(orderDetailSchema.parse(order));
}

export async function listOrderEventsHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const query = orderEventsQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const actor = c.get("actor");
  const orderId = c.req.param("id") ?? "";
  const service = createOrderService(c);

  const order = await service.getOrder(actor.hubId, orderId, actor.tenantId);
  if (!order) {
    return c.json({ error: "not_found" }, 404);
  }

  const items = await service.listEvents(actor.hubId, orderId, query.data.limit, actor.tenantId);
  return c.json(orderEventsResponseSchema.parse({ items }));
}

export async function applyChangeHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = applyChangeInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "INVALID_REQUEST",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  const actor = c.get("actor");
  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.debug("handler_apply_change_received", {
    orderId: parsed.data.orderId,
    intent: parsed.data.intent,
    actorId: actor.actorId,
  });

  const service = createOrderService(c);

  try {
    const result = await service.applyChange(actor, parsed.data, {
      now: nowMs(c.env),
    });
    return c.json(result);
  } catch (error) {
    if (error instanceof ApplyChangeError) {
      return c.json(
        {
          error: error.code,
          ...(error.currentOrder ? { order: error.currentOrder } : {}),
        },
        error.status,
      );
    }
    throw error;
  }
}

export async function getOrderStateHandler(c: Context<LaundryEnv>) {
  const actor = c.get("actor");
  const id = c.req.param("id") ?? "";
  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.debug("handler_get_order_state", { hubId: actor.hubId, orderId: id, tenantId: actor.tenantId });

  const service = createOrderService(c);
  const state = await service.getOrderState(actor.hubId, id, actor.tenantId);
  if (!state) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(state);
}

export async function createOrderCrudHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = createOrderPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: "INVALID_REQUEST",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  const actor = c.get("actor");
  const service = createOrderService(c);
  const orderId = (typeof body?.orderId === "string" ? body.orderId : null) || crypto.randomUUID();
  const mutationId = (typeof body?.mutationId === "string" ? body.mutationId : null) || crypto.randomUUID();

  try {
    const result = await service.applyChange(
      actor,
      {
        intent: "createOrder",
        orderId,
        mutationId,
        payload: parsed.data,
        baseVersion: null,
      },
      { now: nowMs(c.env) },
    );
    return c.json(orderDetailSchema.parse(result.order), 201);
  } catch (error) {
    if (error instanceof ApplyChangeError) {
      return c.json(
        {
          error: error.code,
          ...(error.currentOrder ? { order: error.currentOrder } : {}),
        },
        error.status,
      );
    }
    throw error;
  }
}

export async function cancelOrderHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const id = c.req.param("id") ?? "";
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const service = createOrderService(c);

  const order = await service.getOrder(actor.hubId, id, actor.tenantId);
  if (!order) {
    return c.json({ error: "not_found" }, 404);
  }

  try {
    const reason = typeof body?.reason === "string" ? body.reason : "Cancelled by user request";
    const mutationId = typeof body?.mutationId === "string" ? body.mutationId : crypto.randomUUID();
    const result = await service.applyChange(
      actor,
      {
        intent: "cancel",
        orderId: order.id,
        mutationId,
        payload: { reason },
        baseVersion: order.version,
      },
      { now: nowMs(c.env) },
    );
    return c.json(orderDetailSchema.parse(result.order));
  } catch (error) {
    if (error instanceof ApplyChangeError) {
      return c.json(
        {
          error: error.code,
          ...(error.currentOrder ? { order: error.currentOrder } : {}),
        },
        error.status,
      );
    }
    throw error;
  }
}
