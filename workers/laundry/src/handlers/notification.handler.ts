import type { Context } from "hono";
import {
  notificationClaimRequestSchema,
  notificationClaimResponseSchema,
  notificationOrderStateSchema,
  notificationOutcomeRequestSchema,
  notificationOutcomeResponseSchema,
  notificationSuppressRequestSchema,
  notificationSuppressResponseSchema,
} from "../../../../packages/contracts/src/notifications";
import type { LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";
import { NotificationRepository } from "../repositories/notification.repository";
import { NotificationService } from "../services/notification.service";

function isInternalNotificationActor(actor: { actorType: string }): boolean {
  return actor.actorType === "service" || actor.actorType === "system";
}

function createNotificationService(c: Context<LaundryEnv>): NotificationService {
  const db = c.env.LAUNDRY_DB!;
  const repo = new NotificationRepository(
    db,
    getLaundryLogger(c.env, c.get("requestId"), "repository"),
  );
  return new NotificationService(
    repo,
    getLaundryLogger(c.env, c.get("requestId"), "service"),
  );
}

export async function getNotificationOrderStateHandler(c: Context<LaundryEnv>) {
  const actor = c.get("actor");
  if (!isInternalNotificationActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const id = c.req.param("id") ?? "";
  const service = createNotificationService(c);
  const state = await service.getOrderState(actor.hubId, id);
  if (!state) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(notificationOrderStateSchema.parse(state));
}

export async function claimNotificationHandler(c: Context<LaundryEnv>) {
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

  const service = createNotificationService(c);
  const result = await service.claim(actor.hubId, parsed.data);
  return c.json(notificationClaimResponseSchema.parse(result));
}

export async function suppressNotificationHandler(c: Context<LaundryEnv>) {
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

  const service = createNotificationService(c);
  const result = await service.suppress(actor.hubId, parsed.data);
  return c.json(notificationSuppressResponseSchema.parse(result));
}

export async function recordNotificationOutcomeHandler(c: Context<LaundryEnv>) {
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

  const service = createNotificationService(c);
  const result = await service.recordOutcome(actor.hubId, parsed.data);
  return c.json(notificationOutcomeResponseSchema.parse(result));
}
