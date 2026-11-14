import type { Context } from "hono";
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
} from "../../../../packages/contracts/src/calendar";
import type { LaundryBindings, LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";
import { CalendarRepository } from "../repositories/calendar.repository";
import {
  CalendarRescheduleError,
  CalendarService,
} from "../services/calendar.service";

function nowMs(env: LaundryBindings): number {
  return (env.LAUNDRY_CLOCK ?? Date.now)();
}

function isInternalCalendarActor(actor: { actorType: string }): boolean {
  return actor.actorType === "service" || actor.actorType === "system";
}

function createCalendarService(c: Context<LaundryEnv>): CalendarService {
  const db = c.env.LAUNDRY_DB!;
  const repo = new CalendarRepository(
    db,
    getLaundryLogger(c.env, c.get("requestId"), "repository"),
  );
  return new CalendarService(
    repo,
    db,
    getLaundryLogger(c.env, c.get("requestId"), "service"),
  );
}

export async function getCalendarOrderStateHandler(c: Context<LaundryEnv>) {
  const actor = c.get("actor");
  if (!isInternalCalendarActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const id = c.req.param("id") ?? "";
  const service = createCalendarService(c);
  const state = await service.getOrderState(actor.hubId, id);
  if (!state) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(calendarOrderStateSchema.parse(state));
}

export async function listCalendarOrderStatesHandler(c: Context<LaundryEnv>) {
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
  const service = createCalendarService(c);
  const result = await service.listOrderStates(actor.hubId, { limit, cursor });

  return c.json(calendarOrderListResponseSchema.parse(result));
}

export async function upsertCalendarProjectionHandler(c: Context<LaundryEnv>) {
  const actor = c.get("actor");
  if (!isInternalCalendarActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const id = c.req.param("id") ?? "";
  const body = await c.req.json().catch(() => null);
  const parsed = calendarProjectionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const service = createCalendarService(c);
  const result = await service.upsertProjection(
    actor.hubId,
    id,
    parsed.data,
  );

  if (!result.calendarSync) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(calendarProjectionResponseSchema.parse(result));
}

export async function getCalendarSyncStateHandler(c: Context<LaundryEnv>) {
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

  const service = createCalendarService(c);
  const state = await service.getSyncState(actor.hubId, calendarId);
  return c.json(calendarSyncStateResponseSchema.parse({ state }));
}

export async function saveCalendarSyncStateHandler(c: Context<LaundryEnv>) {
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

  const service = createCalendarService(c);
  const state = await service.saveSyncState(calendarId, parsed.data);
  return c.json(calendarSyncStateResponseSchema.parse({ state }));
}

export async function recordCalendarRepairHandler(c: Context<LaundryEnv>) {
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

  const service = createCalendarService(c);
  const repair = await service.recordRepair(parsed.data);
  return c.json(calendarRepairResponseSchema.parse({ repair }));
}

export async function calendarRescheduleHandler(c: Context<LaundryEnv>) {
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

  const service = createCalendarService(c);
  try {
    const result = await service.reschedule(
      actor,
      parsed.data,
      nowMs(c.env),
    );
    return c.json(calendarRescheduleResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof CalendarRescheduleError) {
      return c.json({ error: error.code }, error.status);
    }
    throw error;
  }
}

export async function completeCalendarOutboxHandler(c: Context<LaundryEnv>) {
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

  const service = createCalendarService(c);
  const completed = await service.completeOutbox(
    actor.hubId,
    parsed.data.outboxId,
    parsed.data.now ?? nowMs(c.env),
  );

  return c.json(calendarOutboxCompleteResponseSchema.parse({ completed }));
}

export async function enqueueCalendarUpsertHandler(c: Context<LaundryEnv>) {
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

  const service = createCalendarService(c);
  const enqueued = await service.enqueueUpsert(
    actor.hubId,
    parsed.data.orderId,
    parsed.data.targetVersion,
    parsed.data.now ?? nowMs(c.env),
  );

  return c.json(calendarEnqueueUpsertResponseSchema.parse({ enqueued }));
}
