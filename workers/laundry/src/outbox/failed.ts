import {
  failedOutboxListResponseSchema,
  type FailedOutboxItem,
  type FailedOutboxListResponse,
} from "../../../../packages/contracts/src/queue-messages";

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

function mapRow(row: FailedOutboxRecord): FailedOutboxItem {
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
    items: rows.map(mapRow),
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
