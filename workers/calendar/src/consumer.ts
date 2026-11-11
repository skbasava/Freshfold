import {
  GoogleAccessTokenProvider,
} from "../../../packages/calendar-client/src/auth";
import {
  GoogleCalendarClient,
  errorStatus,
  type GoogleCalendarEvent,
  type NewGoogleCalendarEvent,
} from "../../../packages/calendar-client/src/client";
import { calendarQueueMessageSchema } from "../../../packages/contracts/src/queue-messages";
import {
  METRICS,
  createLogger,
} from "../../../packages/shared/src/observability";
import { LaundryCalendarClient } from "./laundry";
import {
  buildCanonicalEvent,
  buildCanonicalPatch,
} from "./projection";

const logger = createLogger({ service: "calendar" });

export type ConsumerMessage = {
  body: unknown;
  ack(): void;
  retry(): void;
};

export type CalendarEventApi = {
  insert(event: NewGoogleCalendarEvent): Promise<GoogleCalendarEvent>;
  get(eventId: string): Promise<GoogleCalendarEvent | null | undefined>;
  list(
    parameters?: Record<string, unknown>,
  ): Promise<{
    items: GoogleCalendarEvent[];
    nextPageToken?: string;
    nextSyncToken?: string;
  }>;
  patch(
    eventId: string,
    patch: Partial<GoogleCalendarEvent>,
    options?: { etag?: string | null },
  ): Promise<GoogleCalendarEvent>;
  delete(
    eventId: string,
    options?: { etag?: string | null },
  ): Promise<void>;
};

export type CalendarConsumerEnv = {
  LAUNDRY: Fetcher;
  SERVICE_TOKEN?: string;
  GOOGLE_CALENDAR_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  googleCalendar?: CalendarEventApi;
  now?: () => number;
};

function logConsumerEvent(
  event: string,
  body: unknown,
  details: Record<string, string | number> = {},
): void {
  const record =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  logger.error(event, {
    ...(typeof record.outboxId === "string"
      ? { outboxId: record.outboxId }
      : {}),
    ...(typeof record.orderId === "string" ? { orderId: record.orderId } : {}),
    ...details,
  });
}

export function createCalendarEventApi(
  env: CalendarConsumerEnv,
): CalendarEventApi {
  if (env.googleCalendar) {
    return env.googleCalendar;
  }

  const calendarId = env.GOOGLE_CALENDAR_ID;
  if (
    !calendarId ||
    !env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !env.GOOGLE_PRIVATE_KEY
  ) {
    throw new Error("calendar_config_missing");
  }

  const tokens = new GoogleAccessTokenProvider({
    credentials: {
      clientEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GOOGLE_PRIVATE_KEY,
    },
  });

  return new GoogleCalendarClient({
    calendarId,
    getAccessToken: () => tokens.getAccessToken(),
  }) as CalendarEventApi;
}

export async function processCalendarMessage(
  message: ConsumerMessage,
  env: CalendarConsumerEnv,
): Promise<"acked" | "retried"> {
  const parsed = calendarQueueMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    logConsumerEvent("calendar_queue_message_invalid", message.body, {
      reason: "validation_failed",
    });
    message.retry();
    return "retried";
  }

  if (!env.SERVICE_TOKEN) {
    logConsumerEvent("calendar_queue_message_retried", message.body, {
      reason: "service_token_missing",
    });
    message.retry();
    return "retried";
  }

  const payload = parsed.data;
  const laundry = new LaundryCalendarClient({
    LAUNDRY: env.LAUNDRY,
    SERVICE_TOKEN: env.SERVICE_TOKEN,
  });
  const now = env.now ? env.now() : Date.now();
  const calendarId = env.GOOGLE_CALENDAR_ID ?? "primary";

  let state;
  try {
    state = await laundry.getOrderState(payload.hubId, payload.orderId);
  } catch (error) {
    logConsumerEvent("calendar_queue_message_retried", payload, {
      reason: "reload_failed",
      status: error instanceof Error && "status" in error ? Number((error as { status: unknown }).status) : 0,
    });
    message.retry();
    return "retried";
  }

  if (!state) {
    logConsumerEvent("calendar_queue_message_order_missing", payload);
    message.ack();
    return "acked";
  }

  if (state.order.version > payload.targetVersion) {
    logConsumerEvent("calendar_queue_message_stale", payload, {
      canonicalVersion: state.order.version,
    });
    await completeOutboxSafely(laundry, payload.hubId, payload.outboxId, now);
    message.ack();
    return "acked";
  }

  if (state.order.version < payload.targetVersion) {
    logConsumerEvent("calendar_queue_message_retried", payload, {
      reason: "canonical_version_behind",
      canonicalVersion: state.order.version,
    });
    message.retry();
    return "retried";
  }

  if (
    state.calendarSync &&
    state.calendarSync.syncedVersion >= state.order.version &&
    payload.operation !== "REPAIR_EVENT"
  ) {
    logConsumerEvent("calendar_queue_message_stale", payload, {
      reason: "projection_current",
      syncedVersion: state.calendarSync.syncedVersion,
    });
    await completeOutboxSafely(laundry, payload.hubId, payload.outboxId, now);
    message.ack();
    return "acked";
  }

  const canonical = buildCanonicalEvent(state.order);
  const patch = buildCanonicalPatch(state.order);
  if (!canonical || !patch) {
    logConsumerEvent("calendar_queue_message_skipped", payload, {
      reason: "order_has_no_delivery_at",
    });
    await completeOutboxSafely(laundry, payload.hubId, payload.outboxId, now);
    message.ack();
    return "acked";
  }

  try {
    const event = await upsertEvent(
      createCalendarEventApi(env),
      canonical,
      patch,
    );

    await laundry.saveProjection(payload.hubId, payload.orderId, {
      calendarId,
      eventId: canonical.id,
      etag: event.etag ?? null,
      syncedVersion: state.order.version,
      syncStatus: "synced",
      now,
    });

    await completeOutboxSafely(laundry, payload.hubId, payload.outboxId, now);
    message.ack();
    return "acked";
  } catch (error) {
    logConsumerEvent("calendar_queue_message_retried", payload, {
      reason: "projection_failed",
      status: errorStatus(error),
    });
    message.retry();
    return "retried";
  }
}

async function upsertEvent(
  calendar: CalendarEventApi,
  canonical: NewGoogleCalendarEvent,
  patch: Partial<GoogleCalendarEvent>,
): Promise<GoogleCalendarEvent> {
  try {
    return await calendar.insert(canonical);
  } catch (error) {
    if (errorStatus(error) !== 409) {
      throw error;
    }
  }

  return calendar.patch(canonical.id, patch);
}

async function completeOutboxSafely(
  laundry: LaundryCalendarClient,
  hubId: string,
  outboxId: string,
  now: number,
): Promise<void> {
  try {
    await laundry.completeOutbox(hubId, outboxId, now);
  } catch {
    // A stale/duplicate message may reference an outbox row that is already
    // gone or completed. Projection correctness does not depend on this call.
  }
}

export async function handleCalendarQueue(
  batch: { messages: readonly ConsumerMessage[] },
  env: CalendarConsumerEnv,
): Promise<void> {
  for (const message of batch.messages) {
    const result = await processCalendarMessage(message, env);
    if (result === "retried") {
      logger.metric(METRICS.queueRetries, 1, { queue: "calendar" });
    }
  }
}

