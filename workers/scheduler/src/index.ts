import { Hono, type MiddlewareHandler } from "hono";
import {
  outboxReplayRequestSchema,
  outboxReplayResponseSchema,
} from "../../../packages/contracts/src/queue-messages";
import { safeEqualStrings } from "../../../packages/shared/src/internal-context";
import {
  OBSERVABILITY_EVENTS,
  createLogger,
  safeError,
} from "../../../packages/shared/src/observability";
import {
  handleDlqBatch,
  listFailedOutbox,
  replayOutbox,
  type SchedulerDlqEnv,
} from "./dlq";
import { reportOutboxHealth, type SchedulerHealthEnv } from "./health";
import { sweepOutbox, type SchedulerSweeperEnv } from "./sweeper";

export type SchedulerEnv = SchedulerSweeperEnv &
  SchedulerDlqEnv &
  SchedulerHealthEnv;

type SchedulerHonoEnv = { Bindings: SchedulerEnv };

const app = new Hono<SchedulerHonoEnv>();

const ADMIN_TOKEN_HEADER = "x-admin-token";

const requireAdmin: MiddlewareHandler<SchedulerHonoEnv> = async (c, next) => {
  const expected = c.env.DLQ_ADMIN_TOKEN;
  const provided = c.req.header(ADMIN_TOKEN_HEADER);

  if (
    !expected ||
    !provided ||
    !(await safeEqualStrings(provided, expected))
  ) {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
};

app.get("/health", (c) => c.json({ status: "ok" as const, service: "scheduler" }));

app.get("/internal/dlq/failed", requireAdmin, async (c) => {
  const rawLimit = c.req.query("limit");
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await listFailedOutbox(c.env, { limit });
  return c.json(result);
});

app.post("/internal/dlq/replay", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = outboxReplayRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await replayOutbox(c.env, {
    outboxId: parsed.data.outboxId,
  });

  const logger = createLogger({
    service: "scheduler",
    ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
  });
  logger.info("dlq_replay", {
    actorId: "admin:dlq",
    outboxId: parsed.data.outboxId,
    replayed: result.replayed,
  });

  return c.json(outboxReplayResponseSchema.parse(result));
});

export default {
  fetch: app.fetch,
  scheduled: async (
    controller: ScheduledController,
    env: unknown,
    _ctx: ExecutionContext,
  ): Promise<void> => {
    const runtime = env as SchedulerEnv;
    const now = controller.scheduledTime || Date.now();
    const logger = createLogger({
      service: "scheduler",
      ...(runtime.ENVIRONMENT ? { environment: runtime.ENVIRONMENT } : {}),
    });

    try {
      const result = await sweepOutbox(runtime, { now, limit: 50 });
      logger.info("outbox_sweep_completed", { ...result });
    } catch (error) {
      logger.error("outbox_sweep_failed", { error: safeError(error) });
      throw error;
    }

    try {
      await reportOutboxHealth(runtime, { now, logger });
    } catch (error) {
      logger.warn(OBSERVABILITY_EVENTS.outboxHealthCheckFailed, {
        error: safeError(error),
      });
    }
  },
  queue: async (
    batch: MessageBatch<unknown>,
    env: SchedulerEnv,
  ): Promise<void> => {
    await handleDlqBatch(
      {
        queue: batch.queue,
        messages: batch.messages.map((message) => ({
          body: message.body,
          attempts: message.attempts,
          ack: () => message.ack(),
          retry: () => message.retry(),
        })),
      },
      env,
    );
  },
};
