import { Hono } from "hono";
import { requireActor, type LaundryEnv } from "../authz";
import {
  calendarRescheduleHandler,
  completeCalendarOutboxHandler,
  enqueueCalendarUpsertHandler,
  getCalendarOrderStateHandler,
  getCalendarSyncStateHandler,
  listCalendarOrderStatesHandler,
  recordCalendarRepairHandler,
  saveCalendarSyncStateHandler,
  upsertCalendarProjectionHandler,
} from "../handlers/calendar.handler";

export const calendarRouter = new Hono<LaundryEnv>();

calendarRouter.get(
  "/orders/:id",
  requireActor,
  getCalendarOrderStateHandler,
);

calendarRouter.get(
  "/orders",
  requireActor,
  listCalendarOrderStatesHandler,
);

calendarRouter.post(
  "/orders/:id/projection",
  requireActor,
  upsertCalendarProjectionHandler,
);

calendarRouter.get(
  "/sync-state",
  requireActor,
  getCalendarSyncStateHandler,
);

calendarRouter.put(
  "/sync-state",
  requireActor,
  saveCalendarSyncStateHandler,
);

calendarRouter.post(
  "/repairs",
  requireActor,
  recordCalendarRepairHandler,
);

calendarRouter.post(
  "/reschedule",
  requireActor,
  calendarRescheduleHandler,
);

calendarRouter.post(
  "/outbox/complete",
  requireActor,
  completeCalendarOutboxHandler,
);

calendarRouter.post(
  "/enqueue",
  requireActor,
  enqueueCalendarUpsertHandler,
);

