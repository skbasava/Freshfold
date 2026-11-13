import {
  applyChangeResultSchema,
  type ApplyChangeInput,
  type OrderDetail,
} from "@laundry/contracts";
import { orderDetailSchema } from "@laundry/contracts";
import { localOrderFromServer } from "../orders/local-order";
import {
  METRICS,
  OBSERVABILITY_EVENTS,
  createLogger,
} from "../../../packages/shared/src/observability";
import { syncLogger } from "../lib/logger";
import { defaultFetch, type FetchLike } from "./fetch";
import type { MutationQueue } from "./mutation-queue";
import type { PendingMutation } from "./types";

const logger = createLogger({ service: "web-offline" });

export type MutationTransportResult =
  | {
      kind: "accepted";
      order: OrderDetail;
      replayed: boolean;
      customerCreated?: boolean;
    }
  | {
      kind: "version_conflict";
      order?: OrderDetail;
      error?: string;
    }
  | {
      kind: "rejected";
      status: number;
      error: string;
      order?: OrderDetail;
    }
  | {
      kind: "auth";
      status: number;
      error?: string;
    }
  | {
      kind: "retryable";
      error: string;
      status?: number;
    };

export interface MutationTransport {
  send(input: ApplyChangeInput): Promise<MutationTransportResult>;
}

export interface HttpMutationTransportOptions {
  fetchImpl?: FetchLike;
  endpoint?: string;
  headers?: Record<string, string>;
  credentials?: "same-origin" | "include" | "omit";
}

function errorCode(body: unknown): string | undefined {
  if (
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return undefined;
}

function parseOrder(body: unknown): OrderDetail | undefined {
  if (body === null || typeof body !== "object" || !("order" in body)) {
    return undefined;
  }
  const parsed = orderDetailSchema.safeParse(body.order);
  return parsed.success ? parsed.data : undefined;
}

export function createHttpMutationTransport(
  options: HttpMutationTransportOptions = {},
): MutationTransport {
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const endpoint = options.endpoint ?? "/api/orders/apply-change";

  return {
    async send(input) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          credentials: options.credentials ?? "same-origin",
          headers: {
            "content-type": "application/json",
            ...options.headers,
          },
          body: JSON.stringify(input),
        });
      } catch (error) {
        return {
          kind: "retryable",
          error: error instanceof Error ? error.message : "network_error",
        };
      }

      const body: unknown = await response.json().catch(() => null);
      const code = errorCode(body);

      if (response.ok) {
        const parsed = applyChangeResultSchema.safeParse(body);
        if (!parsed.success) {
          return { kind: "retryable", error: "INVALID_RESPONSE" };
        }
        return {
          kind: "accepted",
          order: parsed.data.order,
          replayed: parsed.data.replayed,
          customerCreated: parsed.data.customerCreated,
        };
      }

      if (response.status === 409 && code === "VERSION_CONFLICT") {
        return {
          kind: "version_conflict",
          order: parseOrder(body),
          error: code,
        };
      }

      if (response.status === 401 || response.status === 403) {
        return { kind: "auth", status: response.status, error: code };
      }

      if (response.status === 429 || response.status >= 500) {
        return {
          kind: "retryable",
          status: response.status,
          error: code ?? `HTTP_${response.status}`,
        };
      }

      return {
        kind: "rejected",
        status: response.status,
        error: code ?? `HTTP_${response.status}`,
        order: parseOrder(body),
      };
    },
  };
}

function buildApplyChangeInput(mutation: PendingMutation): ApplyChangeInput {
  return {
    orderId: mutation.orderId,
    mutationId: mutation.mutationId,
    intent: mutation.intent,
    payload: mutation.payload,
    baseVersion: mutation.baseVersion,
  } as ApplyChangeInput;
}

export interface FlushSummary {
  attempted: number;
  synced: number;
  rejected: number;
  conflicts: number;
  retryable: number;
  paused: number;
}

export interface FlushOptions {
  queue: MutationQueue;
  transport: MutationTransport;
  withOrderLock?: <T>(orderId: string, fn: () => Promise<T>) => Promise<T>;
}

type GroupOutcome = "continue" | "stop-order" | "stop-all";

export async function flushPendingMutations(
  options: FlushOptions,
): Promise<FlushSummary> {
  const summary: FlushSummary = {
    attempted: 0,
    synced: 0,
    rejected: 0,
    conflicts: 0,
    retryable: 0,
    paused: 0,
  };

  const pending = (await options.queue.listMutations()).filter(
    (mutation) => mutation.status === "pending",
  );
  if (pending.length > 0) {
    logger.metric(METRICS.offlinePendingMutations, pending.length);
    logger.info(OBSERVABILITY_EVENTS.offlinePendingMutations, {
      pendingCount: pending.length,
    });
    syncLogger.info("flush_started", {
      pendingCount: pending.length,
      ordersCount: new Set(pending.map((p) => p.orderId)).size,
    });
  } else {
    syncLogger.info("flush_idle", { pendingCount: 0 });
    return summary;
  }
  const groups = new Map<string, PendingMutation[]>();
  for (const mutation of pending) {
    const group = groups.get(mutation.orderId) ?? [];
    group.push(mutation);
    groups.set(mutation.orderId, group);
  }

  for (const group of groups.values()) {
    group.sort((left, right) =>
      left.createdAt === right.createdAt
        ? left.mutationId.localeCompare(right.mutationId)
        : left.createdAt - right.createdAt,
    );
  }

  const processOrder = async (
    orderId: string,
    group: PendingMutation[],
  ): Promise<GroupOutcome> => {
    for (const queued of group) {
      const mutation = await options.queue.getMutation(
        queued.mutationId,
      );
      if (!mutation || mutation.status !== "pending") {
        continue;
      }

      summary.attempted += 1;
      await options.queue.recordAttempt(mutation.mutationId);
      syncLogger.debug("mutation_sending", {
        orderId: mutation.orderId,
        intent: mutation.intent,
        mutationId: mutation.mutationId,
        baseVersion: mutation.baseVersion,
      });
      const result = await options.transport.send(
        buildApplyChangeInput(mutation),
      );

      if (result.kind === "accepted") {
        await options.queue.markSynced(mutation.mutationId, {
          serverOrder: result.order,
        });
        summary.synced += 1;
        syncLogger.info("mutation_synced", {
          orderId: mutation.orderId,
          intent: mutation.intent,
          mutationId: mutation.mutationId,
          version: result.order.version,
        });
        continue;
      }

      if (result.kind === "version_conflict") {
        await options.queue.markConflict(
          mutation.mutationId,
          result.error ?? "VERSION_CONFLICT",
          result.order
            ? localOrderFromServer(result.order, "conflict")
            : null,
        );
        summary.conflicts += 1;
        syncLogger.warn("mutation_conflict", {
          orderId: mutation.orderId,
          mutationId: mutation.mutationId,
          error: result.error ?? "VERSION_CONFLICT",
        });
        return "stop-order";
      }

      if (result.kind === "rejected") {
        await options.queue.markRejected(mutation.mutationId, result.error);
        summary.rejected += 1;
        syncLogger.warn("mutation_rejected", {
          orderId: mutation.orderId,
          mutationId: mutation.mutationId,
          error: result.error,
          status: result.status,
        });
        return "stop-order";
      }

      if (result.kind === "auth") {
        summary.paused += 1;
        syncLogger.warn("mutation_auth_paused", {
          orderId: mutation.orderId,
          mutationId: mutation.mutationId,
          status: result.status,
        });
        return "stop-all";
      }

      summary.retryable += 1;
      syncLogger.warn("mutation_retryable", {
        orderId: mutation.orderId,
        mutationId: mutation.mutationId,
        error: result.error,
      });
      return "stop-all";
    }

    return "continue";
  };

  for (const [orderId, group] of groups) {
    const outcome = options.withOrderLock
      ? await options.withOrderLock(orderId, () =>
          processOrder(orderId, group),
        )
      : await processOrder(orderId, group);
    if (outcome === "stop-all") {
      break;
    }
  }

  if (summary.attempted > 0) {
    syncLogger.info("flush_completed", { ...summary });
  }

  return summary;
}

export interface ReconnectFlushOptions extends FlushOptions {
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  onResult?: (summary: FlushSummary) => void;
  onError?: (error: unknown) => void;
}

export interface ReconnectFlush {
  trigger(): Promise<FlushSummary>;
  idle(): Promise<void>;
  dispose(): void;
}

export function createReconnectFlush(
  options: ReconnectFlushOptions,
): ReconnectFlush {
  let inFlight: Promise<FlushSummary> | null = null;

  const trigger = (): Promise<FlushSummary> => {
    inFlight = flushPendingMutations(options);
    return inFlight;
  };

  const listener = (): void => {
    void trigger()
      .then((summary) => options.onResult?.(summary))
      .catch((error: unknown) => options.onError?.(error));
  };

  options.target.addEventListener("online", listener);

  return {
    trigger,
    async idle() {
      if (inFlight) {
        await inFlight;
      }
    },
    dispose() {
      options.target.removeEventListener("online", listener);
    },
  };
}
