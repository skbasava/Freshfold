import type { OutboxHealthResponse } from "../../../../packages/contracts/src/queue-messages";

type OutboxHealthRecord = {
  pending: number | null;
  dispatching: number | null;
  failed: number | null;
  oldest_pending_at: number | null;
};

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
