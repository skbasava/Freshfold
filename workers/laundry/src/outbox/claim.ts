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
