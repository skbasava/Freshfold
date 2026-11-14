import type { Context } from "hono";
import {
  failedOutboxListResponseSchema,
  outboxHealthResponseSchema,
  outboxReplayRequestSchema,
  outboxReplayResponseSchema,
  outboxSweepRequestSchema,
  outboxSweepResponseSchema,
} from "../../../../packages/contracts/src/queue-messages";
import type { LaundryBindings, LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";
import { OutboxRepository } from "../repositories/outbox.repository";
import { OutboxService } from "../services/outbox.service";

function nowMs(env: LaundryBindings): number {
  return (env.LAUNDRY_CLOCK ?? Date.now)();
}

function isInternalOutboxActor(actor: { actorType: string }): boolean {
  return actor.actorType === "system" || actor.actorType === "service";
}

function createOutboxService(c: Context<LaundryEnv>): OutboxService {
  const db = c.env.LAUNDRY_DB!;
  const repo = new OutboxRepository(
    db,
    getLaundryLogger(c.env, c.get("requestId"), "repository"),
  );
  return new OutboxService(
    repo,
    getLaundryLogger(c.env, c.get("requestId"), "service"),
  );
}

export async function outboxSweepHandler(c: Context<LaundryEnv>) {
  const actor = c.get("actor");
  if (!isInternalOutboxActor(actor)) {
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

  const service = createOutboxService(c);
  const result = await service.sweep(
    {
      CALENDAR_QUEUE: c.env.CALENDAR_QUEUE,
      NOTIFY_QUEUE: c.env.NOTIFY_QUEUE,
    },
    parsed.data,
  );

  return c.json(outboxSweepResponseSchema.parse(result));
}

export async function outboxHealthHandler(c: Context<LaundryEnv>) {
  const actor = c.get("actor");
  if (!isInternalOutboxActor(actor)) {
    return c.json({ error: "forbidden" }, 403);
  }

  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const rawNow = c.req.query("now");
  const now = rawNow === undefined ? nowMs(c.env) : Number(rawNow);
  if (!Number.isInteger(now) || now < 0) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const service = createOutboxService(c);
  const result = await service.getHealth(now);
  return c.json(outboxHealthResponseSchema.parse(result));
}

export async function outboxFailedHandler(c: Context<LaundryEnv>) {
  const actor = c.get("actor");
  if (!isInternalOutboxActor(actor)) {
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

  const service = createOutboxService(c);
  const result = await service.listFailed(limit);
  return c.json(failedOutboxListResponseSchema.parse(result));
}

export async function outboxReplayHandler(c: Context<LaundryEnv>) {
  const actor = c.get("actor");
  if (!isInternalOutboxActor(actor)) {
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

  const service = createOutboxService(c);
  const now = parsed.data.now ?? nowMs(c.env);
  const replayed = await service.replayFailed(parsed.data.outboxId, now);

  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.info("outbox_replayed", {
    actorId: actor.actorId,
    outboxId: parsed.data.outboxId,
    replayed,
  });

  return c.json(outboxReplayResponseSchema.parse({ replayed }));
}

