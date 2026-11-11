export type ProviderErrorKind =
  | "transient"
  | "rate_limited"
  | "terminal"
  | "timeout";

export type ProviderSendErrorOptions = {
  retryAfterMs?: number;
  status?: number;
};

// Provider failures deliberately carry only a safe code. Raw provider
// responses and credentials must never reach logs or durable error fields.
export class ProviderSendError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryAfterMs?: number;
  readonly status?: number;

  constructor(
    kind: ProviderErrorKind,
    safeCode: string,
    options: ProviderSendErrorOptions = {},
  ) {
    super(safeCode);
    this.name = "ProviderSendError";
    this.kind = kind;
    this.retryAfterMs = options.retryAfterMs;
    this.status = options.status;
  }
}

export function isProviderSendError(
  error: unknown,
): error is ProviderSendError {
  return error instanceof ProviderSendError;
}

export function classifyHttpStatus(
  status: number,
  retryAfter: string | null = null,
): ProviderSendError {
  if (status === 408 || status === 504) {
    return new ProviderSendError("timeout", "provider_timeout", { status });
  }

  if (status === 429) {
    return new ProviderSendError("rate_limited", "provider_rate_limited", {
      status,
      retryAfterMs: parseRetryAfterMs(retryAfter),
    });
  }

  if (status >= 500) {
    return new ProviderSendError("transient", "provider_server_error", {
      status,
    });
  }

  return new ProviderSendError("terminal", "provider_rejected", { status });
}

export function classifyThrownError(error: unknown): ProviderSendError {
  if (isProviderSendError(error)) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return new ProviderSendError("timeout", "provider_timeout");
  }

  return new ProviderSendError("transient", "provider_network_error");
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }

  return Math.max(0, date - Date.now());
}
