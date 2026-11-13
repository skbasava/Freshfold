export interface RetryOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  maxRetries?: number;
  jitter?: boolean;
}

export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  factor: 2,
  maxRetries: 5,
  jitter: true,
};

export function computeBackoffDelay(
  retryCount: number,
  options: RetryOptions = {}
): number {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const count = Math.max(0, retryCount);

  // Exponential calculation
  const rawDelay = Math.min(
    opts.maxDelayMs,
    opts.baseDelayMs * Math.pow(opts.factor, count)
  );

  if (!opts.jitter) {
    return Math.round(rawDelay);
  }

  // Full jitter: random value between 0 and rawDelay
  return Math.floor(Math.random() * rawDelay);
}

export function shouldRetry(
  retryCount: number,
  maxRetries = DEFAULT_RETRY_OPTIONS.maxRetries
): boolean {
  return retryCount < maxRetries;
}

