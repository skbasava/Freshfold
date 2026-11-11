import {
  outboxHealthResponseSchema,
  type OutboxHealthResponse,
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
  type Logger,
} from "../../../packages/shared/src/observability";

export const OUTBOX_PENDING_AGE_ALERT_SECONDS = 5 * 60;
export const OUTBOX_PENDING_AGE_CRITICAL_SECONDS = 15 * 60;
export const OUTBOX_FAILED_ALERT_THRESHOLD = 1;

export type OutboxAlert = {
  code: "outbox_pending_age" | "outbox_failed";
  severity: "warning" | "error";
  pending: number;
  dispatching: number;
  failed: number;
  oldestPendingAt: number | null;
  oldestPendingAgeSeconds: number;
};

export type SchedulerHealthEnv = {
  LAUNDRY: Fetcher;
  SERVICE_TOKEN?: string;
  ENVIRONMENT?: string;
};

export function evaluateOutboxAlerts(
  health: OutboxHealthResponse,
): OutboxAlert[] {
  const alerts: OutboxAlert[] = [];
  const base = {
    pending: health.pending,
    dispatching: health.dispatching,
    failed: health.failed,
    oldestPendingAt: health.oldestPendingAt,
    oldestPendingAgeSeconds: health.oldestPendingAgeSeconds,
  };

  if (health.oldestPendingAgeSeconds > OUTBOX_PENDING_AGE_ALERT_SECONDS) {
    alerts.push({
      code: "outbox_pending_age",
      severity:
        health.oldestPendingAgeSeconds >
        OUTBOX_PENDING_AGE_CRITICAL_SECONDS
          ? "error"
          : "warning",
      ...base,
    });
  }

  if (health.failed >= OUTBOX_FAILED_ALERT_THRESHOLD) {
    alerts.push({
      code: "outbox_failed",
      severity: "error",
      ...base,
    });
  }

  return alerts;
}

function serviceHeaders(env: SchedulerHealthEnv): Record<string, string> {
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

export async function reportOutboxHealth(
  env: SchedulerHealthEnv,
  options: {
    now?: number;
    logger?: Logger;
  } = {},
): Promise<OutboxHealthResponse> {
  const now = options.now ?? Date.now();
  const logger =
    options.logger ??
    createLogger({
      service: "scheduler",
      ...(env.ENVIRONMENT ? { environment: env.ENVIRONMENT } : {}),
    });

  const response = await env.LAUNDRY.fetch(
    `https://laundry.internal/internal/outbox/health?now=${now}`,
    { headers: serviceHeaders(env) },
  );

  if (!response.ok) {
    throw new Error("outbox_health_fetch_failed");
  }

  const health = outboxHealthResponseSchema.parse(await response.json());

  logger.metric(METRICS.outboxPending, health.pending);
  logger.metric(METRICS.outboxDispatching, health.dispatching);
  logger.metric(METRICS.outboxFailed, health.failed);
  logger.metric(
    METRICS.outboxOldestPendingAgeSeconds,
    health.oldestPendingAgeSeconds,
  );

  for (const alert of evaluateOutboxAlerts(health)) {
    logger.log(alert.severity === "warning" ? "warn" : "error", OBSERVABILITY_EVENTS.outboxAlert, {
      ...alert,
    });
  }

  return health;
}
