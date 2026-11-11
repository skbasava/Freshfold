import {
  failedOutboxListResponseSchema,
  outboxQueueMessageSchema,
  outboxReplayResponseSchema,
  type FailedOutboxListResponse,
  type OutboxReplayResponse,
} from "../../../packages/contracts/src/queue-messages";
import {
  SERVICE_HUB_HEADER,
  SERVICE_NAME_HEADER,
  SERVICE_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
} from "../../../packages/contracts/src/http";

import {
  METRICS,
  OBSERVABILITY_EVENTS,
  createLogger,
} from "../../../packages/shared/src/observability";

export const DLQ_CALENDAR_QUEUE = "laundry-calendar-dlq";
export const DLQ_NOTIFY_QUEUE = "laundry-notify-dlq";
export const DLQ_QUEUE_NAMES = [DLQ_CALENDAR_QUEUE, DLQ_NOTIFY_QUEUE] as const;

const logger = createLogger({ service: "scheduler" });

export type SchedulerDlqEnv = {
  LAUNDRY: Fetcher;
  SERVICE_TOKEN?: string;
  DLQ_ADMIN_TOKEN?: string;
  ENVIRONMENT?: string;
};

export type DlqMessage = {
  body: unknown;
  attempts: number;
  ack(): void;
  retry(): void;
};

export type DlqBatch = {
  queue: string;
  messages: readonly DlqMessage[];
};

function logDlqMessage(
  queue: string,
  message: DlqMessage,
  body: unknown,
): void {
  const record =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const destination =
    record.destination === "calendar" || record.destination === "notification"
      ? record.destination
      : undefined;

  logger.error(OBSERVABILITY_EVENTS.dlqMessage, {
    queue,
    ...(typeof record.outboxId === "string"
      ? { outboxId: record.outboxId }
      : {}),
    ...(typeof record.orderId === "string" ? { orderId: record.orderId } : {}),
    ...(destination ? { destination } : {}),
    ...(typeof record.targetVersion === "number"
      ? { targetVersion: record.targetVersion }
      : {}),
    attempts: message.attempts,
  });
  logger.metric(METRICS.dlqMessages, 1, {
    queue,
    ...(destination ? { destination } : {}),
  });
}

export async function handleDlqBatch(
  batch: DlqBatch,
  _env: SchedulerDlqEnv,
): Promise<void> {
  for (const message of batch.messages) {
    const parsed = outboxQueueMessageSchema.safeParse(message.body);
    logDlqMessage(
      batch.queue,
      message,
      parsed.success ? parsed.data : message.body,
    );
    // Poison messages are isolated in the DLQ and must not be retried back
    // into the source queue automatically.
    message.ack();
  }
}

function serviceHeaders(env: SchedulerDlqEnv): Record<string, string> {
  if (!env.SERVICE_TOKEN) {
    throw new Error("service_token_missing");
  }

  return {
    [SERVICE_TOKEN_HEADER]: env.SERVICE_TOKEN,
    [SERVICE_NAME_HEADER]: "scheduler",
    [SERVICE_TENANT_HEADER]: "system",
    [SERVICE_HUB_HEADER]: "system",
  };
}

export async function listFailedOutbox(
  env: SchedulerDlqEnv,
  { limit = 50 }: { limit?: number } = {},
): Promise<FailedOutboxListResponse> {
  const effectiveLimit = Math.min(Math.max(limit, 1), 100);
  const headers = serviceHeaders(env);
  const response = await env.LAUNDRY.fetch(
    `https://laundry.internal/internal/outbox/failed?limit=${effectiveLimit}`,
    { headers },
  );

  if (!response.ok) {
    throw new Error("dlq_list_failed");
  }

  return failedOutboxListResponseSchema.parse(await response.json());
}

export async function replayOutbox(
  env: SchedulerDlqEnv,
  { outboxId }: { outboxId: string },
): Promise<OutboxReplayResponse> {
  const headers = serviceHeaders(env);
  const response = await env.LAUNDRY.fetch(
    "https://laundry.internal/internal/outbox/replay",
    {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
      },
      body: JSON.stringify({ outboxId }),
    },
  );

  if (!response.ok) {
    throw new Error("dlq_replay_failed");
  }

  return outboxReplayResponseSchema.parse(await response.json());
}
