import { Hono } from "hono";
import {
  OBSERVABILITY_EVENTS,
  createLogger,
  type Logger,
} from "../../../packages/shared/src/observability";
import {
  createCalendarEventApi,
  handleCalendarQueue,
  type CalendarConsumerEnv,
} from "./consumer";
import { LaundryCalendarClient } from "./laundry";
import { runCalendarPoll } from "./poller";
import { runCalendarReconciliation } from "./reconciliation";

export type CalendarRuntimeEnv = CalendarConsumerEnv & {
  CALENDAR_DLQ?: Queue;
  CALENDAR_HUB_ID?: string;
  ENVIRONMENT?: string;
};

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" as const, service: "calendar" }));

function logRecord(
  logger: Logger,
  record: Record<string, unknown>,
): void {
  const { event, ...fields } = record;
  logger.info(String(event ?? "calendar_event"), fields);
}

function runtimeDependencies(env: CalendarRuntimeEnv, now: number) {
  if (!env.GOOGLE_CALENDAR_ID) {
    throw new Error("calendar_config_missing");
  }

  const laundry = new LaundryCalendarClient({
    LAUNDRY: env.LAUNDRY,
    SERVICE_TOKEN: env.SERVICE_TOKEN,
  });

  return {
    laundry,
    calendar: createCalendarEventApi(env),
    calendarId: env.GOOGLE_CALENDAR_ID,
    hubId: env.CALENDAR_HUB_ID ?? "hub-1",
    now,
  };
}

export default {
  fetch: (request: Request, env: unknown, ctx: ExecutionContext) =>
    app.fetch(request, env as never, ctx),
  queue: async (
    batch: MessageBatch<unknown>,
    env: CalendarConsumerEnv,
  ): Promise<void> => {
    await handleCalendarQueue(
      {
        messages: batch.messages.map((message) => ({
          body: message.body,
          ack: () => message.ack(),
          retry: () => message.retry(),
        })),
      },
      env,
    );
  },
  scheduled: async (
    controller: ScheduledController,
    env: unknown,
    _ctx: ExecutionContext,
  ): Promise<void> => {
    const runtime = env as CalendarRuntimeEnv;
    const now = runtime.now
      ? runtime.now()
      : controller.scheduledTime || Date.now();
    const dependencies = runtimeDependencies(runtime, now);
    const logger = createLogger({
      service: "calendar",
      ...(runtime.ENVIRONMENT ? { environment: runtime.ENVIRONMENT } : {}),
    });
    const record = (entry: Record<string, unknown>): void =>
      logRecord(logger, entry);
    const metric = (name: string, value: number): void =>
      logger.metric(name, value);

    if (controller.cron === "0 18 * * *") {
      const result = await runCalendarReconciliation({
        ...dependencies,
        logger: record,
        onAlert: (alert) =>
          logger.error("calendar_reconciliation_alert", { ...alert }),
        onMetric: metric,
      });
      if (result.drift > 0) {
        logger.warn(OBSERVABILITY_EVENTS.reconciliationDrift, {
          orders: result.orders,
          drift: result.drift,
          unresolved: result.unresolved,
        });
      }
      record({
        event: "calendar_reconciliation_completed",
        orders: result.orders,
        healthy: result.healthy,
        enqueued: result.enqueued,
        skippedPending: result.skippedPending,
        unresolved: result.unresolved,
        drift: result.drift,
        unknownEvents: result.unknownEvents,
      });
      return;
    }

    const result = await runCalendarPoll({
      ...dependencies,
      logger: record,
      onMetric: metric,
    });
    record({
      event: "calendar_poll_completed",
      fullSync: result.fullSync,
      pages: result.pages,
      rescheduled: result.rescheduled,
      reverts: result.reverts,
      restores: result.restores,
      skipped: result.skipped,
      unknown: result.unknown,
    });
  },
};
