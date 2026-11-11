import { Hono, type Context } from "hono";
import {
  changeFeedQuerySchema,
  changeFeedResponseSchema,
  orderEventsQuerySchema,
  orderEventsResponseSchema,
} from "../../../packages/contracts/src/changes";
import { applyChangeInputSchema } from "../../../packages/contracts/src/mutations";
import { membershipResolutionRequestSchema } from "../../../packages/contracts/src/supabase-auth";
import { REQUEST_ID_HEADER } from "../../../packages/contracts/src/http";
import {
  customerListResponseSchema,
  customerSchema,
  orderDetailSchema,
  orderListResponseSchema,
} from "../../../packages/contracts/src/orders";
import { can, isPermission } from "../../../packages/domain/src/permissions";
import {
  hasHubAccess,
  requireActor,
  requirePermission,
  requireService,
  type LaundryEnv,
} from "./authz";
import { resolveEmployeeMembership } from "./authz/employees";
import { getCustomer, listCustomers } from "./customers/read";
import { applyChange, ApplyChangeError } from "./orders/apply-change";
import { listOrderEvents } from "./orders/events";
import { getOrder, listOrders } from "./orders/read";
import { decodeCursor, parseListQuery } from "./pagination";
import { listChanges } from "./sync/changes";
import { dispatchOutboxBatch } from "./outbox";
import {
  listFailedOutboxRows,
  replayFailedOutboxRow,
} from "./outbox/failed";
import { getOutboxHealth } from "./outbox/health";
import {
  failedOutboxListResponseSchema,
  outboxHealthResponseSchema,
  outboxReplayRequestSchema,
  outboxReplayResponseSchema,
  outboxSweepRequestSchema,
  outboxSweepResponseSchema,
} from "../../../packages/contracts/src/queue-messages";
import {
  notificationClaimRequestSchema,
  notificationClaimResponseSchema,
  notificationOrderStateSchema,
  notificationOutcomeRequestSchema,
  notificationOutcomeResponseSchema,
  notificationSuppressRequestSchema,
  notificationSuppressResponseSchema,
} from "../../../packages/contracts/src/notifications";
import {
  calendarEnqueueUpsertRequestSchema,
  calendarEnqueueUpsertResponseSchema,
  calendarOrderListResponseSchema,
  calendarOrderStateSchema,
  calendarOutboxCompleteRequestSchema,
  calendarOutboxCompleteResponseSchema,
  calendarProjectionRequestSchema,
  calendarProjectionResponseSchema,
  calendarRepairRequestSchema,
  calendarRepairResponseSchema,
  calendarRescheduleRequestSchema,
  calendarRescheduleResponseSchema,
  calendarSyncStatePutRequestSchema,
  calendarSyncStateResponseSchema,
} from "../../../packages/contracts/src/calendar";
import {
  completeCalendarOutbox,
  enqueueCalendarUpsert,
  getCalendarOrderState,
  getCalendarSyncState,
  listCalendarOrderStates,
  recordCalendarRepair,
  saveCalendarSyncStateForCalendar,
  upsertCalendarProjection,
} from "./calendar/store";
import {
  CalendarRescheduleError,
  rescheduleFromCalendar,
} from "./calendar/reschedule";
import {
  claimNotification,
  getNotificationOrderState,
  recordNotificationOutcome,
  suppressNotification,
} from "./notifications/store";
import {
  METRICS,
  OBSERVABILITY_EVENTS,
  createLogger,
} from "../../../packages/shared/src/observability";

const app = new Hono<LaundryEnv>();

app.use("*", async (c, next) => {
  const id = c.req.header(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  c.set("requestId", id);
  c.header(REQUEST_ID_HEADER, id);
  await next();
});

app.get("/health", (c) =>
  c.json({ status: "ok" as const, service: "laundry" }),
);

app.get("/internal/whoami", requireActor, (c) =>
  c.json(c.get("actor")),
);

app.post(
  "/internal/auth/resolve-membership",
  requireService(["gateway"]),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: "database_unavailable" }, 503);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = membershipResolutionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const result = await resolveEmployeeMembership(
      db,
      parsed.data.supabaseSubject,
      parsed.data.hubId,
    );

    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }

    return c.json(result.response);
  },
);

app.get("/internal/authz/check", requireActor, (c) => {
  const permission = c.req.query("permission");
  const tenantId = c.req.query("tenantId");
  const hubId = c.req.query("hubId");

  if (!isPermission(permission) || !tenantId || !hubId) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const actor = c.get("actor");
  const allowed =
    can(actor.role, permission) &&
    hasHubAccess(actor, { tenantId, hubId });

  return c.json({ allowed }, allowed ? 200 : 403);
});

app.get("/internal/orders/:id", requireActor, async (c) => {
  const actor = c.get("actor");
  if (actor.actorType !== "service" && actor.actorType !== "system") {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const order = await getOrder(db, actor.hubId, c.req.param("id"));
  if (!order) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(orderDetailSchema.parse(order));
});

function isInternalNotificationActor(actor: { actorType: string }): boolean {
  return actor.actorType === "service" || actor.actorType === "system";
}

app.get("/internal/notifications/orders/:id", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalNotificationActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const state = await getNotificationOrderState(
    db,
    actor.hubId,
    c.req.param("id"),
  );
  if (!state) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(notificationOrderStateSchema.parse(state));
});

app.post("/internal/notifications/claim", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalNotificationActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = notificationClaimRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await claimNotification(db, actor.hubId, parsed.data);
  return c.json(notificationClaimResponseSchema.parse(result));
});

app.post("/internal/notifications/suppress", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalNotificationActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = notificationSuppressRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await suppressNotification(db, actor.hubId, parsed.data);
  return c.json(notificationSuppressResponseSchema.parse(result));
});

app.post("/internal/notifications/outcome", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalNotificationActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = notificationOutcomeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await recordNotificationOutcome(
    db,
    actor.hubId,
    parsed.data,
  );
  return c.json(notificationOutcomeResponseSchema.parse(result));
});

app.post("/internal/outbox/sweep", requireActor, async (c) => {
  const actor = c.get("actor");
  if (actor.actorType !== "system" && actor.actorType !== "service") {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  let body: unknown = {};
  const text = await c.req.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }
  }

  const parsed = outboxSweepRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await dispatchOutboxBatch(
    db,
    {
      CALENDAR_QUEUE: c.env.CALENDAR_QUEUE,
      NOTIFY_QUEUE: c.env.NOTIFY_QUEUE,
    },
    parsed.data,
  );

  return c.json(outboxSweepResponseSchema.parse(result));
});

app.get("/internal/outbox/health", requireActor, async (c) => {
  const actor = c.get("actor");
  if (actor.actorType !== "system" && actor.actorType !== "service") {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const rawNow = c.req.query("now");
  const now = rawNow === undefined ? Date.now() : Number(rawNow);
  if (!Number.isInteger(now) || now < 0) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await getOutboxHealth(db, now);
  return c.json(outboxHealthResponseSchema.parse(result));
});

app.get("/internal/outbox/failed", requireActor, async (c) => {
  const actor = c.get("actor");
  if (actor.actorType !== "system" && actor.actorType !== "service") {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const rawLimit = c.req.query("limit");
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await listFailedOutboxRows(db, limit);
  return c.json(failedOutboxListResponseSchema.parse(result));
});

app.post("/internal/outbox/replay", requireActor, async (c) => {
  const actor = c.get("actor");
  if (actor.actorType !== "system" && actor.actorType !== "service") {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = outboxReplayRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const now = parsed.data.now ?? Date.now();
  const replayed = await replayFailedOutboxRow(
    db,
    parsed.data.outboxId,
    now,
  );

  console.log(
    JSON.stringify({
      level: "info",
      event: "outbox_replayed",
      actorId: actor.actorId,
      outboxId: parsed.data.outboxId,
      replayed,
    }),
  );

  return c.json(outboxReplayResponseSchema.parse({ replayed }));
});

app.get(
  "/api/customers",
  requireActor,
  requirePermission("view_orders"),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: "database_unavailable" }, 503);
    }

    const query = parseListQuery(c.req.query());
    if (!query) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const actor = c.get("actor");
    const result = await listCustomers(db, actor.hubId, {
      limit: query.limit,
      cursor,
    });

    return c.json(customerListResponseSchema.parse(result));
  },
);

app.get(
  "/api/customers/:id",
  requireActor,
  requirePermission("view_orders"),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: "database_unavailable" }, 503);
    }

    const actor = c.get("actor");
    const customer = await getCustomer(db, actor.hubId, c.req.param("id"));
    if (!customer) {
      return c.json({ error: "not_found" }, 404);
    }

    return c.json(customerSchema.parse(customer));
  },
);

app.get(
  "/api/orders",
  requireActor,
  requirePermission("view_orders"),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: "database_unavailable" }, 503);
    }

    const query = parseListQuery(c.req.query());
    if (!query) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const actor = c.get("actor");
    const result = await listOrders(db, actor.hubId, {
      limit: query.limit,
      cursor,
    });

    return c.json(orderListResponseSchema.parse(result));
  },
);

app.get(
  "/api/changes",
  requireActor,
  requirePermission("view_orders"),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: "database_unavailable" }, 503);
    }

    const query = changeFeedQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const actor = c.get("actor");
    const result = await listChanges(db, actor.hubId, query.data);
    return c.json(changeFeedResponseSchema.parse(result));
  },
);

app.get(
  "/api/orders/:id/events",
  requireActor,
  requirePermission("view_orders"),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: "database_unavailable" }, 503);
    }

    const query = orderEventsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const actor = c.get("actor");
    const orderId = c.req.param("id");
    const order = await getOrder(db, actor.hubId, orderId);
    if (!order) {
      return c.json({ error: "not_found" }, 404);
    }

    const items = await listOrderEvents(
      db,
      actor.hubId,
      orderId,
      query.data.limit,
    );
    return c.json(orderEventsResponseSchema.parse({ items }));
  },
);

app.get(
  "/api/orders/:id",
  requireActor,
  requirePermission("view_orders"),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: "database_unavailable" }, 503);
    }

    const actor = c.get("actor");
    const order = await getOrder(db, actor.hubId, c.req.param("id"));
    if (!order) {
      return c.json({ error: "not_found" }, 404);
    }

    return c.json(orderDetailSchema.parse(order));
  },
);

async function applyChangeHandler(c: Context<LaundryEnv>) {
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
  const logger = createLogger({
    service: "laundry",
    ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
    requestId: c.get("requestId"),
  });

  try {
    const result = await applyChange(db, actor, parsed.data);
    return c.json(result);
  } catch (error) {
    if (error instanceof ApplyChangeError) {
      if (
        error.code === "VERSION_CONFLICT" ||
        error.code === "MUTATION_PAYLOAD_MISMATCH"
      ) {
        logger.warn(OBSERVABILITY_EVENTS.mutationConflict, {
          orderId: parsed.data.orderId,
          code: error.code,
          actorType: actor.actorType,
        });
        logger.metric(METRICS.mutationConflicts, 1, {
          reason: error.code,
        });
      }

      if (error.code === "SLOT_FULL") {
        logger.warn(OBSERVABILITY_EVENTS.capacityRejection, {
          orderId: parsed.data.orderId,
          code: error.code,
          actorType: actor.actorType,
        });
        logger.metric(METRICS.capacityRejections, 1, {
          reason: error.code,
        });
      }

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

app.post("/api/orders/apply-change", requireActor, applyChangeHandler);
app.post("/internal/apply-change", requireActor, applyChangeHandler);

function isInternalCalendarActor(actor: { actorType: string }): boolean {
  return actor.actorType === "service" || actor.actorType === "system";
}

app.get("/internal/calendar/orders/:id", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalCalendarActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const state = await getCalendarOrderState(
    db,
    actor.hubId,
    c.req.param("id"),
  );
  if (!state) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(calendarOrderStateSchema.parse(state));
});

app.get("/internal/calendar/orders", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalCalendarActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const rawLimit = c.req.query("limit");
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const cursor = c.req.query("cursor") ?? null;
  const result = await listCalendarOrderStates(db, actor.hubId, {
    limit,
    cursor,
  });
  return c.json(calendarOrderListResponseSchema.parse(result));
});

app.post(
  "/internal/calendar/orders/:id/projection",
  requireActor,
  async (c) => {
    const actor = c.get("actor");
    if (!isInternalCalendarActor(actor)) {
      return c.json({ error: "forbidden" }, 403);
    }

    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: "database_unavailable" }, 503);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = calendarProjectionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const result = await upsertCalendarProjection(
      db,
      actor.hubId,
      c.req.param("id"),
      parsed.data,
    );
    if (!result.calendarSync) {
      return c.json({ error: "not_found" }, 404);
    }

    return c.json(calendarProjectionResponseSchema.parse(result));
  },
);

app.get("/internal/calendar/sync-state", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalCalendarActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const calendarId = c.req.query("calendarId");
  if (!calendarId) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const state = await getCalendarSyncState(db, actor.hubId, calendarId);
  return c.json(calendarSyncStateResponseSchema.parse({ state }));
});

app.put("/internal/calendar/sync-state", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalCalendarActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const calendarId = c.req.query("calendarId");
  if (!calendarId) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = calendarSyncStatePutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  if (parsed.data.hubId !== actor.hubId) {
    return c.json({ error: "forbidden" }, 403);
  }

  const state = await saveCalendarSyncStateForCalendar(
    db,
    calendarId,
    parsed.data,
  );
  return c.json(calendarSyncStateResponseSchema.parse({ state }));
});

app.post("/internal/calendar/repairs", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalCalendarActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = calendarRepairRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  if (parsed.data.hubId !== actor.hubId) {
    return c.json({ error: "forbidden" }, 403);
  }

  const repair = await recordCalendarRepair(db, parsed.data);
  return c.json(calendarRepairResponseSchema.parse({ repair }));
});

app.post("/internal/calendar/reschedule", requireActor, async (c) => {
  const actor = c.get("actor");
  if (actor.actorId !== "system:calendar") {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = calendarRescheduleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const now = Date.now();
  try {
    const result = await rescheduleFromCalendar(
      db,
      actor,
      parsed.data,
      now,
    );
    return c.json(calendarRescheduleResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof CalendarRescheduleError) {
      const logger = createLogger({
        service: "laundry",
        ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
        requestId: c.get("requestId"),
      });

      if (error.code === "VERSION_CONFLICT") {
        logger.warn(OBSERVABILITY_EVENTS.mutationConflict, {
          orderId: parsed.data.orderId,
          code: error.code,
          actorType: actor.actorType,
        });
        logger.metric(METRICS.mutationConflicts, 1, {
          reason: error.code,
        });
      }

      if (error.code === "SLOT_FULL") {
        logger.warn(OBSERVABILITY_EVENTS.capacityRejection, {
          orderId: parsed.data.orderId,
          code: error.code,
          actorType: actor.actorType,
        });
        logger.metric(METRICS.capacityRejections, 1, {
          reason: error.code,
        });
      }

      return c.json({ error: error.code }, error.status);
    }
    throw error;
  }
});

app.post("/internal/calendar/outbox/complete", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalCalendarActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = calendarOutboxCompleteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const completed = await completeCalendarOutbox(
    db,
    actor.hubId,
    parsed.data.outboxId,
    parsed.data.now ?? Date.now(),
  );
  return c.json(
    calendarOutboxCompleteResponseSchema.parse({ completed }),
  );
});

app.post("/internal/calendar/enqueue", requireActor, async (c) => {
  const actor = c.get("actor");
  if (!isInternalCalendarActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = calendarEnqueueUpsertRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const enqueued = await enqueueCalendarUpsert(
    db,
    actor.hubId,
    parsed.data.orderId,
    parsed.data.targetVersion,
    parsed.data.now ?? Date.now(),
  );
  return c.json(calendarEnqueueUpsertResponseSchema.parse({ enqueued }));
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
