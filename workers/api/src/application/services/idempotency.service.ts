import type { SystemRepository } from "../../domain/repositories/system.repository";
import { IdempotencyConflictError } from "../../shared/errors";
import { addHoursIso, type Clock } from "../../shared/time";

export interface IdempotentResult<T> {
  replayed: boolean;
  statusCode: number;
  data: T;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class IdempotencyService {
  constructor(
    private readonly system: SystemRepository,
    private readonly clock: Clock,
    private readonly ttlHours = 24,
  ) {}

  async execute<T>(params: {
    operation: string;
    idempotencyKey?: string | null;
    payload: unknown;
    statusCode: number;
    run: () => Promise<T>;
  }): Promise<IdempotentResult<T>> {
    const key = params.idempotencyKey?.trim();
    if (!key) {
      const data = await params.run();
      return { replayed: false, statusCode: params.statusCode, data };
    }

    const requestHash = await sha256Hex(stableStringify(params.payload));
    const existing = await this.system.findIdempotency(params.operation, key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError(
          `Idempotency key '${key}' was already used with a different request payload`,
        );
      }
      return {
        replayed: true,
        statusCode: existing.responseStatus,
        data: JSON.parse(existing.responseBodyJson) as T,
      };
    }

    const data = await params.run();
    const nowIso = this.clock.nowIso();
    await this.system.saveIdempotency({
      operation: params.operation,
      idempotencyKey: key,
      requestHash,
      responseStatus: params.statusCode,
      responseBodyJson: JSON.stringify(data),
      expiresAt: addHoursIso(nowIso, this.ttlHours),
      createdAt: nowIso,
    });

    return { replayed: false, statusCode: params.statusCode, data };
  }
}
