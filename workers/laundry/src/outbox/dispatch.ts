import type { OutboxQueueMessage } from "../../../../packages/contracts/src/queue-messages";
import {
  claimOutbox,
  markOutboxDone,
  markOutboxFailed,
  type OutboxRow,
} from "./claim";

export type OutboxQueues = {
  CALENDAR_QUEUE?: Queue<OutboxQueueMessage>;
  NOTIFY_QUEUE?: Queue<OutboxQueueMessage>;
};

export type DispatchOptions = {
  now?: number;
  limit?: number;
};

export type DispatchResult = {
  claimed: number;
  sent: number;
  failed: number;
};

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
  options: DispatchOptions = {},
): Promise<DispatchResult> {
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
