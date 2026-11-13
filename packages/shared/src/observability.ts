export type LogSeverity = "debug" | "info" | "warn" | "error";
export type LogLevel = LogSeverity | "silent";

export const LOG_LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export const OBSERVABILITY_EVENTS = {
  metric: "observability_metric",
  outboxBacklog: "outbox_backlog",
  outboxAlert: "outbox_alert",
  outboxHealthCheckFailed: "outbox_health_check_failed",
  queueRetry: "queue_retry",
  dlqMessage: "dlq_message",
  syncTokenReset: "calendar_sync_token_invalid",
  calendarRevert: "calendar_revert",
  reconciliationDrift: "calendar_reconciliation_drift",
  notificationFailure: "notification_failure",
  mutationConflict: "mutation_conflict",
  offlinePendingMutations: "offline_pending_mutations",
  capacityRejection: "capacity_rejection",
  // Workflow events
  httpRequestReceived: "http_request_received",
  httpRequestCompleted: "http_request_completed",
  authSuccess: "auth_success",
  authFailure: "auth_failure",
  forwardUpstream: "forward_upstream",
  applyChangeStarted: "apply_change_started",
  applyChangeAccepted: "apply_change_accepted",
  applyChangeRejected: "apply_change_rejected",
  applyChangeReplayed: "apply_change_replayed",
  applyChangeConflict: "apply_change_conflict",
  syncFeedPolled: "sync_feed_polled",
  outboxBatchDispatched: "outbox_batch_dispatched",
} as const;

export type ObservabilityEvent =
  (typeof OBSERVABILITY_EVENTS)[keyof typeof OBSERVABILITY_EVENTS];

export const METRICS = {
  outboxPending: "outbox_pending_count",
  outboxDispatching: "outbox_dispatching_count",
  outboxFailed: "outbox_failed_count",
  outboxOldestPendingAgeSeconds: "outbox_oldest_pending_age_seconds",
  queueRetries: "queue_retry_count",
  dlqMessages: "dlq_message_count",
  syncTokenResets: "calendar_sync_token_reset_count",
  calendarReverts: "calendar_revert_count",
  reconciliationDrift: "calendar_reconciliation_drift",
  notificationFailures: "notification_failure_count",
  mutationConflicts: "mutation_conflict_count",
  offlinePendingMutations: "offline_pending_mutation_count",
  capacityRejections: "capacity_rejection_count",
} as const;

export type MetricName = (typeof METRICS)[keyof typeof METRICS];

export type LogFields = Record<string, unknown>;

export type LoggerOptions = {
  service: string;
  environment?: string;
  requestId?: string;
  correlationId?: string;
  sink?: (line: string) => void;
  now?: () => number;
  level?: LogLevel;
  enabled?: boolean;
};

export type Logger = {
  log(severity: LogSeverity, event: string, fields?: LogFields): void;
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  metric(name: string, value: number, fields?: LogFields): void;
  child(overrides: Partial<LoggerOptions>): Logger;
};

export type SafeError = {
  name: string;
  code: string;
};

const SENSITIVE_KEY =
  /(secret|token|password|passwd|api[-_]?key|private[-_]?key|authorization|auth[-_]?header|cookie|credential|signature|csrf|session|bearer|(^|[-_])key$)/i;
const PHONE_KEY =
  /^(phone|phone[-_]?normalized|phone[-_]?number|customer[-_]?phone|msisdn|mobile|recipient|to)$/i;
const MESSAGE_KEY =
  /^(message|message[-_]?body|body|content|contents|text|notes?|comment|comments|hold[-_]?comment|description|payload|detail[-_]?json|detail)$/i;
const CUSTOMER_NAME_KEY = /^(customer[-_]?name|contact[-_]?name)$/i;

const PEM_PRIVATE_KEY =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER_TOKEN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_TOKEN =
  /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const GOOGLE_OAUTH_TOKEN = /ya29\.[A-Za-z0-9._-]+/g;
const GOOGLE_API_KEY = /AIza[0-9A-Za-z_-]{20,}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_IN_TEXT = /\+?\d[\d\s().-]{8,}\d/g;

const REDACTED = "[REDACTED]";
const REDACTED_PHONE = "[REDACTED_PHONE]";
const REDACTED_EMAIL = "[REDACTED_EMAIL]";
const REDACTED_CONTENT = "[REDACTED_CONTENT]";
const REDACTED_TOKEN = "[REDACTED_TOKEN]";

function digitCount(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

function looksLikePhone(value: string): boolean {
  if (!/^\+?[\d\s().-]+$/.test(value)) {
    return false;
  }
  const digits = digitCount(value);
  return digits >= 10 && digits <= 15;
}

function redactString(value: string): string {
  if (looksLikePhone(value)) {
    return REDACTED_PHONE;
  }

  return value
    .replace(PEM_PRIVATE_KEY, REDACTED_TOKEN)
    .replace(BEARER_TOKEN, REDACTED_TOKEN)
    .replace(JWT_TOKEN, REDACTED_TOKEN)
    .replace(GOOGLE_OAUTH_TOKEN, REDACTED_TOKEN)
    .replace(GOOGLE_API_KEY, REDACTED_TOKEN)
    .replace(PHONE_IN_TEXT, (candidate, offset: number, whole: string) => {
      const previous = offset > 0 ? whole[offset - 1] : "";
      if (previous && /[A-Za-z0-9_-]/.test(previous)) {
        return candidate;
      }
      return looksLikePhone(candidate) ? REDACTED_PHONE : candidate;
    })
    .replace(EMAIL, REDACTED_EMAIL);
}

function redactedKeyValue(key: string, value: unknown): string | null {
  if (SENSITIVE_KEY.test(key)) {
    return REDACTED;
  }
  if (PHONE_KEY.test(key)) {
    return REDACTED_PHONE;
  }
  if (CUSTOMER_NAME_KEY.test(key)) {
    return "[REDACTED_PII]";
  }
  if (MESSAGE_KEY.test(key)) {
    return REDACTED_CONTENT;
  }
  if (
    /^destination$/i.test(key) &&
    typeof value === "string" &&
    looksLikePhone(value)
  ) {
    return REDACTED_PHONE;
  }
  return null;
}

export function redactValue(value: unknown): unknown {
  return redactInternal(value, 0, new WeakSet<object>());
}

function redactInternal(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return "[UNSERIALIZABLE]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return safeError(value);
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  if (depth >= 8) {
    return "[MAX_DEPTH]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const keyRedaction = redactedKeyValue(key, item);
    result[key] =
      keyRedaction === null
        ? redactInternal(item, depth + 1, seen)
        : keyRedaction;
  }
  return result;
}

export function safeError(error: unknown): SafeError {
  if (error instanceof Error) {
    const explicitCode =
      "code" in error && typeof error.code === "string" ? error.code : null;
    return {
      name: error.name || "Error",
      code:
        explicitCode ??
        (error.name && error.name !== "Error" ? error.name : "unknown"),
    };
  }

  if (typeof error === "object" && error !== null) {
    const record = error as { name?: unknown; code?: unknown };
    return {
      name: typeof record.name === "string" ? record.name : "Error",
      code: typeof record.code === "string" ? record.code : "unknown",
    };
  }

  return { name: "Error", code: "unknown" };
}

function defaultSink(severity: LogSeverity, line: string): void {
  if (severity === "error") {
    console.error(line);
    return;
  }
  if (severity === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function reservedField(name: string): boolean {
  return name === "level" || name === "event" || name === "timestamp";
}

export function readLogLevelFromEnv(env?: Record<string, unknown>): {
  level: LogLevel;
  enabled: boolean;
} {
  const proc = (
    globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;

  const getVal = (key: string): unknown => {
    if (env && key in env) return env[key];
    if (proc?.env && key in proc.env) {
      return proc.env[key];
    }
    return undefined;
  };

  const rawEnabled = getVal("ENABLE_LOGS") ?? getVal("VITE_ENABLE_LOGS");
  const enabled =
    rawEnabled === undefined || rawEnabled === null
      ? true
      : String(rawEnabled).toLowerCase() === "true" || rawEnabled === "1";

  if (!enabled) {
    return { level: "silent", enabled: false };
  }

  const rawLevel = getVal("LOG_LEVEL") ?? getVal("VITE_LOG_LEVEL");
  if (typeof rawLevel === "string") {
    const lower = rawLevel.toLowerCase().trim();
    if (
      lower === "silent" ||
      lower === "none" ||
      lower === "off" ||
      lower === "false"
    ) {
      return { level: "silent", enabled: false };
    }
    if (
      lower === "debug" ||
      lower === "info" ||
      lower === "warn" ||
      lower === "error"
    ) {
      return { level: lower as LogSeverity, enabled: true };
    }
  }

  return { level: "info", enabled: true };
}

export function createLogger(options: LoggerOptions): Logger {
  const sink = options.sink;
  const now = options.now ?? Date.now;

  const envConfig = readLogLevelFromEnv();
  const enabled = options.enabled ?? envConfig.enabled;
  const configuredLevel: LogLevel = !enabled
    ? "silent"
    : options.level ?? envConfig.level;
  const minWeight =
    LOG_LEVEL_WEIGHTS[configuredLevel] ?? LOG_LEVEL_WEIGHTS.info;

  const emit = (
    severity: LogSeverity,
    event: string,
    fields: LogFields = {},
  ): void => {
    if (configuredLevel === "silent" || !enabled) {
      return;
    }
    const currentWeight = LOG_LEVEL_WEIGHTS[severity] ?? LOG_LEVEL_WEIGHTS.info;
    if (currentWeight < minWeight) {
      return;
    }

    const correlationId = options.correlationId ?? options.requestId;
    const base: LogFields = {
      service: options.service,
      ...(options.environment ? { environment: options.environment } : {}),
      ...(options.requestId ? { requestId: options.requestId } : {}),
      ...(correlationId ? { correlationId } : {}),
    };

    const combined = redactValue({ ...base, ...fields }) as LogFields;
    const sanitizedFields: LogFields = {};
    for (const [key, value] of Object.entries(combined)) {
      if (!reservedField(key)) {
        sanitizedFields[key] = value;
      }
    }

    const record = {
      level: severity,
      event,
      timestamp: new Date(now()).toISOString(),
      ...sanitizedFields,
    };
    const line = JSON.stringify(record);
    if (sink) {
      sink(line);
    } else {
      defaultSink(severity, line);
    }
  };

  const logger: Logger = {
    log: emit,
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
    metric: (name, value, fields) =>
      emit("info", OBSERVABILITY_EVENTS.metric, {
        metric: name,
        value: Number.isFinite(value) ? value : 0,
        ...fields,
      }),
    child: (overrides) =>
      createLogger({
        ...options,
        ...overrides,
        level: overrides.level ?? options.level,
        enabled: overrides.enabled ?? options.enabled,
        sink: overrides.sink ?? options.sink,
        now: overrides.now ?? options.now,
      }),
  };

  return logger;
}
