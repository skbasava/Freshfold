import {
  notificationQueueMessageSchema,
  type NotificationQueueMessage,
} from "../../../packages/contracts/src/queue-messages";
import {
  notificationChannelSchema,
  type NotificationChannel,
  type NotificationLedger,
  type NotificationOrderState,
  type NotificationOutcome,
} from "../../../packages/contracts/src/notifications";
import {
  classifyThrownError,
  createNotificationProvider,
  isProviderSendError,
  type NotificationProviderAdapter,
  type ProviderErrorKind,
} from "../../../packages/notification-client/src/index";
import {
  METRICS,
  createLogger,
} from "../../../packages/shared/src/observability";
import {
  evaluateNotificationEligibility,
} from "./eligibility";
import {
  LaundryRequestError,
  NotificationLaundryClient,
} from "./laundry";

const logger = createLogger({ service: "notifications" });

export type ConsumerMessage = {
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

export type NotificationConsumerEnv = {
  LAUNDRY: Fetcher;
  SERVICE_TOKEN?: string;
  NOTIFICATION_CHANNEL?: string;
  NOTIFICATION_DELAY_SECONDS?: string;
  WHATSAPP_API_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_API_VERSION?: string;
  SMS_API_URL?: string;
  SMS_API_TOKEN?: string;
  SMS_SENDER_ID?: string;
  SMS_IDEMPOTENCY_HEADER?: string;
  notificationProvider?: NotificationProviderAdapter;
  now?: () => number;
};

const IN_PROGRESS_RETRY_SECONDS = 30;
const MAX_DELAY_SECONDS = 86_400;

function logConsumerEvent(
  event: string,
  body: unknown,
  details: Record<string, string | number | boolean> = {},
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

function safeStatus(error: unknown): number {
  if (error instanceof LaundryRequestError) {
    return error.status;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return 0;
}

function configuredChannel(env: NotificationConsumerEnv): NotificationChannel {
  const parsed = notificationChannelSchema.safeParse(env.NOTIFICATION_CHANNEL);
  return parsed.success ? parsed.data : "whatsapp";
}

function configuredDelaySeconds(env: NotificationConsumerEnv): number {
  const value = Number(env.NOTIFICATION_DELAY_SECONDS ?? "0");
  if (!Number.isInteger(value) || value < 0) {
    return 0;
  }
  return Math.min(value, MAX_DELAY_SECONDS);
}

function resolveProvider(
  env: NotificationConsumerEnv,
): NotificationProviderAdapter {
  if (env.notificationProvider) {
    return env.notificationProvider;
  }

  const channel = configuredChannel(env);
  if (channel === "sms") {
    if (!env.SMS_API_URL || !env.SMS_API_TOKEN || !env.SMS_SENDER_ID) {
      throw new Error("notification_provider_config_missing");
    }

    return createNotificationProvider({
      channel: "sms",
      endpoint: env.SMS_API_URL,
      apiKey: env.SMS_API_TOKEN,
      senderId: env.SMS_SENDER_ID,
      ...(env.SMS_IDEMPOTENCY_HEADER
        ? { idempotencyHeader: env.SMS_IDEMPOTENCY_HEADER }
        : {}),
    });
  }

  if (!env.WHATSAPP_API_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("notification_provider_config_missing");
  }

  return createNotificationProvider({
    channel: "whatsapp",
    accessToken: env.WHATSAPP_API_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    ...(env.WHATSAPP_API_VERSION
      ? { apiVersion: env.WHATSAPP_API_VERSION }
      : {}),
  });
}

function buildMessageBody(order: NotificationOrderState): string {
  return `Laundry order ${order.id} status: ${order.status}.`;
}

function secondsUntil(now: number, intendedAt: number): number {
  return Math.min(
    MAX_DELAY_SECONDS,
    Math.max(1, Math.ceil((intendedAt - now) / 1000)),
  );
}

function retryDelayFromMs(
  retryAfterMs: number | undefined,
): { delaySeconds?: number } {
  if (retryAfterMs === undefined) {
    return {};
  }
  return {
    delaySeconds: Math.min(
      MAX_DELAY_SECONDS,
      Math.max(1, Math.ceil(retryAfterMs / 1000)),
    ),
  };
}

function errorKind(error: unknown): {
  kind: ProviderErrorKind;
  code: string;
  retryAfterMs?: number;
} {
  const providerError = isProviderSendError(error)
    ? error
    : classifyThrownError(error);

  return {
    kind: providerError.kind,
    code: providerError.message,
    retryAfterMs: providerError.retryAfterMs,
  };
}

async function recordOutcome(
  laundry: NotificationLaundryClient,
  hubId: string,
  payload: NotificationQueueMessage,
  notification: NotificationLedger,
  outcome: NotificationOutcome,
  now: number,
  details: {
    providerMessageId?: string | null;
    errorCode?: string | null;
  } = {},
): Promise<boolean> {
  try {
    await laundry.recordOutcome(hubId, {
      notificationId: notification.id,
      outboxId: payload.outboxId,
      targetVersion: payload.targetVersion,
      outcome,
      ...(details.providerMessageId !== undefined
        ? { providerMessageId: details.providerMessageId }
        : {}),
      ...(details.errorCode !== undefined
        ? { errorCode: details.errorCode }
        : {}),
      now,
    });
    return true;
  } catch (error) {
    logConsumerEvent("notification_outcome_record_failed", payload, {
      reason: "outcome_record_failed",
      status: safeStatus(error),
      providerAccepted: outcome === "sent",
    });
    logger.metric(METRICS.notificationFailures, 1, {
      reason: "outcome_record_failed",
    });
    return false;
  }
}

async function deliverClaimedNotification(
  message: ConsumerMessage,
  laundry: NotificationLaundryClient,
  provider: NotificationProviderAdapter,
  payload: NotificationQueueMessage,
  order: NotificationOrderState,
  notification: NotificationLedger,
  now: number,
): Promise<"acked" | "retried"> {
  const idempotencyKey = provider.supportsIdempotency
    ? notification.idempotencyKey
    : undefined;

  try {
    const result = await provider.send({
      to: order.customerPhone,
      channel: provider.channel,
      body: buildMessageBody(order),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    const recorded = await recordOutcome(
      laundry,
      payload.hubId,
      payload,
      notification,
      "sent",
      now,
      { providerMessageId: result.id },
    );

    if (!recorded && provider.supportsIdempotency) {
      message.retry();
      return "retried";
    }

    message.ack();
    return "acked";
  } catch (error) {
    const failure = errorKind(error);
    logger.metric(METRICS.notificationFailures, 1, {
      reason: failure.kind,
    });

    if (failure.kind === "terminal") {
      const recorded = await recordOutcome(
        laundry,
        payload.hubId,
        payload,
        notification,
        "failed",
        now,
        { errorCode: failure.code },
      );
      if (!recorded && provider.supportsIdempotency) {
        message.retry();
        return "retried";
      }
      message.ack();
      return "acked";
    }

    if (failure.kind === "timeout") {
      if (!provider.supportsIdempotency) {
        const recorded = await recordOutcome(
          laundry,
          payload.hubId,
          payload,
          notification,
          "uncertain",
          now,
          { errorCode: failure.code },
        );
        if (!recorded) {
          message.ack();
          return "acked";
        }
        message.ack();
        return "acked";
      }

      const recorded = await recordOutcome(
        laundry,
        payload.hubId,
        payload,
        notification,
        "retry",
        now,
        { errorCode: failure.code },
      );
      if (!recorded) {
        message.retry();
        return "retried";
      }
      message.retry({ delaySeconds: IN_PROGRESS_RETRY_SECONDS });
      return "retried";
    }

    const recorded = await recordOutcome(
      laundry,
      payload.hubId,
      payload,
      notification,
      "retry",
      now,
      { errorCode: failure.code },
    );
    if (!recorded && provider.supportsIdempotency) {
      message.retry();
      return "retried";
    }
    if (!recorded) {
      message.ack();
      return "acked";
    }

    message.retry(retryDelayFromMs(failure.retryAfterMs));
    return "retried";
  }
}

export async function processNotificationMessage(
  message: ConsumerMessage,
  env: NotificationConsumerEnv,
): Promise<"acked" | "retried"> {
  const parsed = notificationQueueMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    logConsumerEvent("notification_queue_message_invalid", message.body, {
      reason: "validation_failed",
    });
    message.retry();
    return "retried";
  }

  if (!env.SERVICE_TOKEN) {
    logConsumerEvent("notification_queue_message_retried", message.body, {
      reason: "service_token_missing",
    });
    message.retry();
    return "retried";
  }

  const payload = parsed.data;
  const laundry = new NotificationLaundryClient({
    LAUNDRY: env.LAUNDRY,
    SERVICE_TOKEN: env.SERVICE_TOKEN,
  });
  const now = env.now ? env.now() : Date.now();

  let order: NotificationOrderState | null;
  try {
    order = await laundry.getOrderState(payload.hubId, payload.orderId);
  } catch (error) {
    logConsumerEvent("notification_queue_message_retried", payload, {
      reason: "reload_failed",
      status: safeStatus(error),
    });
    message.retry();
    return "retried";
  }

  if (!order) {
    logConsumerEvent("notification_queue_message_order_missing", payload);
    message.ack();
    return "acked";
  }

  const eligibility = evaluateNotificationEligibility({
    order,
    targetVersion: payload.targetVersion,
  });

  if (eligibility.action === "retry") {
    logConsumerEvent("notification_queue_message_retried", payload, {
      reason: eligibility.reason,
      canonicalVersion: order.version,
    });
    message.retry();
    return "retried";
  }

  if (eligibility.action === "suppress") {
    try {
      await laundry.suppress(payload.hubId, {
        outboxId: payload.outboxId,
        orderId: payload.orderId,
        targetVersion: payload.targetVersion,
        channel: configuredChannel(env),
        reason: eligibility.reason,
        now,
      });
    } catch (error) {
      logConsumerEvent("notification_queue_message_retried", payload, {
        reason: "suppress_failed",
        status: safeStatus(error),
      });
      message.retry();
      return "retried";
    }

    logConsumerEvent("notification_queue_message_suppressed", payload, {
      reason: eligibility.reason,
    });
    message.ack();
    return "acked";
  }

  let provider: NotificationProviderAdapter;
  try {
    provider = resolveProvider(env);
  } catch {
    logConsumerEvent("notification_queue_message_retried", payload, {
      reason: "provider_config_missing",
    });
    message.retry();
    return "retried";
  }

  let claim;
  try {
    claim = await laundry.claim(payload.hubId, {
      outboxId: payload.outboxId,
      orderId: payload.orderId,
      targetVersion: payload.targetVersion,
      channel: provider.channel,
      delaySeconds: configuredDelaySeconds(env),
      now,
    });
  } catch (error) {
    logConsumerEvent("notification_queue_message_retried", payload, {
      reason: "claim_failed",
      status: safeStatus(error),
    });
    message.retry();
    return "retried";
  }

  if (claim.outcome === "not_due") {
    const intendedAt = claim.intendedAt ?? now;
    logConsumerEvent("notification_queue_message_delayed", payload, {
      reason: "not_due",
      intendedAt,
    });
    message.retry({ delaySeconds: secondsUntil(now, intendedAt) });
    return "retried";
  }

  if (claim.outcome === "claimed" && claim.notification) {
    return deliverClaimedNotification(
      message,
      laundry,
      provider,
      payload,
      order,
      claim.notification,
      now,
    );
  }

  if (claim.outcome === "in_progress") {
    logConsumerEvent("notification_queue_message_retried", payload, {
      reason: "claim_in_progress",
    });
    message.retry({ delaySeconds: IN_PROGRESS_RETRY_SECONDS });
    return "retried";
  }

  const ackReasons: Record<string, string> = {
    already_sent: "already_sent",
    suppressed: "suppressed",
    failed: "ledger_failed",
    order_missing: "order_missing",
    not_eligible: "claim_not_eligible",
  };

  logConsumerEvent("notification_queue_message_acked", payload, {
    reason: ackReasons[claim.outcome] ?? "no_claim",
  });
  message.ack();
  return "acked";
}

export async function handleNotificationQueue(
  batch: { messages: readonly ConsumerMessage[] },
  env: NotificationConsumerEnv,
): Promise<void> {
  for (const message of batch.messages) {
    const result = await processNotificationMessage(message, env);
    if (result === "retried") {
      logger.metric(METRICS.queueRetries, 1, { queue: "notification" });
    }
  }
}
