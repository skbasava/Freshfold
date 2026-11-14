import {
  failedOutboxListResponseSchema,
  type FailedOutboxItem,
  type FailedOutboxListResponse,
  type OutboxHealthResponse,
  type OutboxQueueMessage,
  type OutboxSweepRequest,
  type OutboxSweepResponse,
} from "../../../../packages/contracts/src/queue-messages";
import type { Logger } from "../../../../packages/shared/src/observability";
import type { IOutboxRepository } from "../interfaces/outbox.interface";

export const OUTBOX_LEASE_MS = 60_000;
export const OUTBOX_MAX_ATTEMPTS = 8;
export const OUTBOX_BACKOFF_BASE_MS = 30_000;
export const OUTBOX_BACKOFF_MAX_MS = 15 * 60_000;

export type OutboxDestination = "calendar" | "notification";
export type OutboxStatus = "pending" | "dispatching" | "done" | "failed";

export type OutboxRow = {
  id: string;
  hubId: string;
  orderId: string;
  destination: OutboxDestination;
  operation: string;
  targetVersion: number;
  mutationId: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  lastError: string | null;
  createdAt: number;
  completedAt: number | null;
};

export type ClaimOptions = {
  now?: number;
  limit?: number;
  leaseMs?: number;
};

export type OutboxLease = {
  id: string;
  leaseToken: string;
  attempts: number;
};

type OutboxRecord = {
  id: string;
  hub_id: string;
  order_id: string;
  destination: OutboxDestination;
  operation: string;
  target_version: number;
  mutation_id: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: number;
  lease_token: string | null;
  lease_expires_at: number | null;
  last_error: string | null;
  created_at: number;
  completed_at: number | null;
};

type FailedOutboxRecord = {
  id: string;
  hub_id: string;
  order_id: string;
  destination: "calendar" | "notification";
  operation: string;
  target_version: number;
  attempts: number;
  last_error: string | null;
  created_at: number;
  completed_at: number | null;
};

type OutboxHealthRecord = {
  pending: number | null;
  dispatching: number | null;
  failed: number | null;
  oldest_pending_at: number | null;
};

export type OutboxQueues = {
  CALENDAR_QUEUE?: Queue<OutboxQueueMessage>;
  NOTIFY_QUEUE?: Queue<OutboxQueueMessage>;
};

function mapRow(row: OutboxRecord): OutboxRow {
  return {
    id: row.id,
    hubId: row.hub_id,
    orderId: row.order_id,
    destination: row.destination,
    operation: row.operation,
    targetVersion: row.target_version,
    mutationId: row.mutation_id,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapFailedRow(row: FailedOutboxRecord): FailedOutboxItem {
  return {
    id: row.id,
    hubId: row.hub_id,
    orderId: row.order_id,
    destination: row.destination,
    operation: row.operation,
    targetVersion: row.target_version,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function computeBackoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(
    OUTBOX_BACKOFF_MAX_MS,
    OUTBOX_BACKOFF_BASE_MS * 2 ** exponent,
  );
}

export async function claimOutbox(
  db: D1Database,
  options: ClaimOptions = {},
): Promise<OutboxRow[]> {
  const now = options.now ?? Date.now();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const leaseMs = options.leaseMs ?? OUTBOX_LEASE_MS;
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = now + leaseMs;

  const results = await db.batch([
    db
      .prepare(
        `UPDATE outbox
         SET status = 'pending', lease_token = NULL, lease_expires_at = NULL
         WHERE status = 'dispatching'
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at < ?`,
      )
      .bind(now),
    db
      .prepare(
        `UPDATE outbox
         SET status = 'dispatching',
             lease_token = ?,
             lease_expires_at = ?,
             attempts = attempts + 1
         WHERE id IN (
           SELECT id FROM outbox
           WHERE status IN ('pending', 'dispatching')
             AND next_attempt_at <= ?
             AND (lease_expires_at IS NULL OR lease_expires_at < ?)
           ORDER BY next_attempt_at ASC, created_at ASC
           LIMIT ?
         )`,
      )
      .bind(leaseToken, leaseExpiresAt, now, now, limit),
    db
      .prepare(
        `SELECT id, hub_id, order_id, destination, operation, target_version,
                mutation_id, status, attempts, next_attempt_at, lease_token,
                lease_expires_at, last_error, created_at, completed_at
         FROM outbox
         WHERE lease_token = ?
         ORDER BY next_attempt_at ASC, created_at ASC`,
      )
      .bind(leaseToken),
  ]);

  const records = (results[2]?.results ?? []) as OutboxRecord[];
  return records.map(mapRow);
}

export const claimOutboxBatch = claimOutbox;

export async function reclaimStaleOutboxRows(
  db: D1Database,
  now: number = Date.now(),
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE outbox
       SET status = 'pending', lease_token = NULL, lease_expires_at = NULL
       WHERE status = 'dispatching'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at < ?`,
    )
    .bind(now)
    .run();
  return result.meta.changes ?? 0;
}

export async function markOutboxDone(
  db: D1Database,
  id: string,
  leaseToken: string,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE outbox
       SET status = 'done',
           completed_at = ?,
           lease_token = NULL,
           lease_expires_at = NULL,
           last_error = NULL
       WHERE id = ? AND lease_token = ? AND status = 'dispatching'`,
    )
    .bind(now, id, leaseToken)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function markOutboxFailed(
  db: D1Database,
  lease: OutboxLease,
  now: number,
  error: string,
): Promise<boolean> {
  const exhausted = lease.attempts >= OUTBOX_MAX_ATTEMPTS;
  const nextAttemptAt = exhausted ? now : now + computeBackoffMs(lease.attempts);
  const result = await db
    .prepare(
      `UPDATE outbox
       SET status = ?,
           next_attempt_at = ?,
           lease_token = NULL,
           lease_expires_at = NULL,
           last_error = ?
       WHERE id = ? AND lease_token = ? AND status = 'dispatching'`,
    )
    .bind(
      exhausted ? "failed" : "pending",
      nextAttemptAt,
      error.slice(0, 500),
      lease.id,
      lease.leaseToken,
    )
    .run();

  return (result.meta.changes ?? 0) > 0;
}

function toMessage(row: OutboxRow): OutboxQueueMessage {
  return {
    outboxId: row.id,
    hubId: row.hubId,
    orderId: row.orderId,
    destination: row.destination,
    operation: row.operation,
    targetVersion: row.targetVersion,
    mutationId: row.mutationId,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "queue_send_failed";
}

export async function dispatchOutboxBatch(
  db: D1Database,
  queues: OutboxQueues,
  options: { now?: number; limit?: number } = {},
): Promise<OutboxSweepResponse> {
  const now = options.now ?? Date.now();
  const rows = await claimOutbox(db, { now, limit: options.limit });
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const queue =
      row.destination === "calendar"
        ? queues.CALENDAR_QUEUE
        : queues.NOTIFY_QUEUE;

    if (!queue) {
      await markOutboxFailed(
        db,
        {
          id: row.id,
          leaseToken: row.leaseToken!,
          attempts: row.attempts,
        },
        now,
        "queue_binding_missing",
      );
      failed++;
      continue;
    }

    try {
      await queue.send(toMessage(row));
      await markOutboxDone(db, row.id, row.leaseToken!, now);
      sent++;
    } catch (error) {
      await markOutboxFailed(
        db,
        {
          id: row.id,
          leaseToken: row.leaseToken!,
          attempts: row.attempts,
        },
        now,
        errorMessage(error),
      );
      failed++;
    }
  }

  return { claimed: rows.length, sent, failed };
}

export async function listFailedOutboxRows(
  db: D1Database,
  limit = 50,
): Promise<FailedOutboxListResponse> {
  const results = await db.batch([
    db.prepare("SELECT COUNT(*) AS total FROM outbox WHERE status = 'failed'"),
    db
      .prepare(
        `SELECT id, hub_id, order_id, destination, operation, target_version,
                attempts, last_error, created_at, completed_at
         FROM outbox
         WHERE status = 'failed'
         ORDER BY created_at ASC, id ASC
         LIMIT ?`,
      )
      .bind(limit),
  ]);

  const countRow = results[0]?.results?.[0] as { total: number } | undefined;
  const rows = (results[1]?.results ?? []) as FailedOutboxRecord[];

  return failedOutboxListResponseSchema.parse({
    items: rows.map(mapFailedRow),
    total: countRow?.total ?? 0,
  });
}

export async function replayFailedOutboxRow(
  db: D1Database,
  outboxId: string,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE outbox
       SET status = 'pending',
           attempts = 0,
           next_attempt_at = ?,
           lease_token = NULL,
           lease_expires_at = NULL,
           last_error = NULL,
           completed_at = NULL
       WHERE id = ? AND status = 'failed'`,
    )
    .bind(now, outboxId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function getOutboxHealth(
  db: D1Database,
  now: number = Date.now(),
): Promise<OutboxHealthResponse> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM outbox WHERE status = 'pending') AS pending,
         (SELECT COUNT(*) FROM outbox WHERE status = 'dispatching') AS dispatching,
         (SELECT COUNT(*) FROM outbox WHERE status = 'failed') AS failed,
         (SELECT MIN(created_at) FROM outbox
          WHERE status IN ('pending', 'dispatching')) AS oldest_pending_at`,
    )
    .first<OutboxHealthRecord>();

  const oldestPendingAt = row?.oldest_pending_at ?? null;
  const oldestPendingAgeSeconds =
    oldestPendingAt === null
      ? 0
      : Math.max(0, Math.floor((now - oldestPendingAt) / 1000));

  return {
    pending: row?.pending ?? 0,
    dispatching: row?.dispatching ?? 0,
    failed: row?.failed ?? 0,
    oldestPendingAt,
    oldestPendingAgeSeconds,
    checkedAt: now,
  };
}

export class OutboxRepository implements IOutboxRepository {
  constructor(
    private readonly db: D1Database,
    private readonly logger?: Logger,
  ) {}

  async getHealth(now: number): Promise<OutboxHealthResponse> {
    const start = Date.now();
    this.logger?.debug("outbox_repo_get_health_started", { now });

    const result = await getOutboxHealth(this.db, now);

    this.logger?.debug("outbox_repo_get_health_completed", {
      pending: result.pending,
      failed: result.failed,
      durationMs: Date.now() - start,
    });

    return result;
  }

  async listFailed(limit: number): Promise<FailedOutboxListResponse> {
    const start = Date.now();
    this.logger?.debug("outbox_repo_list_failed_started", { limit });

    const result = await listFailedOutboxRows(this.db, limit);

    this.logger?.debug("outbox_repo_list_failed_completed", {
      count: result.items.length,
      durationMs: Date.now() - start,
    });

    return result;
  }

  async replayFailed(outboxId: string, now: number): Promise<boolean> {
    const start = Date.now();
    this.logger?.debug("outbox_repo_replay_failed_started", { outboxId, now });

    const replayed = await replayFailedOutboxRow(this.db, outboxId, now);

    this.logger?.info("outbox_repo_replay_failed_completed", {
      outboxId,
      replayed,
      durationMs: Date.now() - start,
    });

    return replayed;
  }

  async dispatchBatch(
    queues: {
      CALENDAR_QUEUE?: Queue<OutboxQueueMessage>;
      NOTIFY_QUEUE?: Queue<OutboxQueueMessage>;
    },
    options: OutboxSweepRequest,
  ): Promise<OutboxSweepResponse> {
    const start = Date.now();
    this.logger?.debug("outbox_repo_dispatch_batch_started", {
      limit: options.limit,
    });

    const result = await dispatchOutboxBatch(this.db, queues, options);

    this.logger?.info("outbox_repo_dispatch_batch_completed", {
      claimed: result.claimed,
      sent: result.sent,
      failed: result.failed,
      durationMs: Date.now() - start,
    });

    return result;
  }
}
