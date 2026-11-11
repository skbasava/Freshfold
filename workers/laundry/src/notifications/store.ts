import {
  notificationChannelSchema,
  notificationLedgerSchema,
  type NotificationChannel,
  type NotificationClaimRequest,
  type NotificationClaimResponse,
  type NotificationLedger,
  type NotificationOrderState,
  type NotificationOutcomeRequest,
  type NotificationOutcomeResponse,
  type NotificationOutcome,
  type NotificationState,
  type NotificationSuppressRequest,
  type NotificationSuppressResponse,
} from "../../../../packages/contracts/src/notifications";

export const NOTIFICATION_CLAIM_LEASE_MS = 5 * 60_000;

type NotificationOrderRow = {
  id: string;
  hub_id: string;
  version: number;
  status: string;
  service_type: string;
  delivery_at: number | null;
  last_notified_delivery_at: number | null;
  customer_name: string;
  customer_phone: string;
};

type NotificationRow = {
  id: string;
  hub_id: string;
  order_id: string;
  channel: NotificationChannel;
  destination: string;
  intended_at: number;
  idempotency_key: string;
  state: NotificationState;
  provider_message_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

export function notificationIdempotencyKey(
  hubId: string,
  orderId: string,
  targetVersion: number,
): string {
  return `notification:${hubId}:${orderId}:${targetVersion}`;
}

export async function getNotificationOrderState(
  db: D1Database,
  hubId: string,
  orderId: string,
): Promise<NotificationOrderState | null> {
  const row = await db
    .prepare(
      `SELECT o.id, o.hub_id, o.version, o.status, o.service_type,
              o.delivery_at, o.last_notified_delivery_at,
              c.name AS customer_name, c.phone AS customer_phone
       FROM orders o
       JOIN customers c ON c.id = o.customer_id AND c.hub_id = o.hub_id
       WHERE o.id = ? AND o.hub_id = ?`,
    )
    .bind(orderId, hubId)
    .first<NotificationOrderRow>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    hubId: row.hub_id,
    version: row.version,
    status: row.status,
    serviceType: row.service_type,
    deliveryAt: row.delivery_at,
    lastNotifiedDeliveryAt: row.last_notified_delivery_at,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
  };
}

function mapNotification(row: NotificationRow): NotificationLedger {
  return notificationLedgerSchema.parse({
    id: row.id,
    hubId: row.hub_id,
    orderId: row.order_id,
    channel: notificationChannelSchema.parse(row.channel),
    destination: row.destination,
    intendedAt: row.intended_at,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    providerMessageId: row.provider_message_id,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function findNotification(
  db: D1Database,
  hubId: string,
  idempotencyKey: string,
): Promise<NotificationRow | null> {
  return db
    .prepare(
      `SELECT id, hub_id, order_id, channel, destination, intended_at,
              idempotency_key, state, provider_message_id, attempts,
              last_error, created_at, updated_at
       FROM notifications
       WHERE hub_id = ? AND idempotency_key = ?`,
    )
    .bind(hubId, idempotencyKey)
    .first<NotificationRow>();
}

export async function claimNotification(
  db: D1Database,
  hubId: string,
  input: NotificationClaimRequest,
): Promise<NotificationClaimResponse> {
  const now = input.now ?? Date.now();
  const delaySeconds = input.delaySeconds ?? 0;

  const outbox = await db
    .prepare(
      `SELECT created_at FROM outbox
       WHERE id = ? AND hub_id = ? AND destination = 'notification'`,
    )
    .bind(input.outboxId, hubId)
    .first<{ created_at: number }>();

  const intendedAt = (outbox?.created_at ?? now) + delaySeconds * 1000;
  if (now < intendedAt) {
    return { outcome: "not_due", intendedAt, notification: null };
  }

  const order = await db
    .prepare("SELECT version FROM orders WHERE id = ? AND hub_id = ?")
    .bind(input.orderId, hubId)
    .first<{ version: number }>();

  if (!order) {
    return { outcome: "order_missing", intendedAt, notification: null };
  }

  if (order.version !== input.targetVersion) {
    return { outcome: "not_eligible", intendedAt, notification: null };
  }

  const id = crypto.randomUUID();
  const idempotencyKey = notificationIdempotencyKey(
    hubId,
    input.orderId,
    input.targetVersion,
  );
  const claimLeaseCutoff = now - NOTIFICATION_CLAIM_LEASE_MS;

  const results = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO notifications (
          id, hub_id, order_id, channel, destination, intended_at,
          idempotency_key, state, attempts, created_at, updated_at
        )
        SELECT ?, o.hub_id, o.id, ?, c.phone, ?, ?, 'pending', 0, ?, ?
        FROM orders o
        JOIN customers c
          ON c.id = o.customer_id AND c.hub_id = o.hub_id
        WHERE o.id = ? AND o.hub_id = ? AND o.version = ?`,
      )
      .bind(
        id,
        input.channel,
        intendedAt,
        idempotencyKey,
        now,
        now,
        input.orderId,
        hubId,
        input.targetVersion,
      ),
    db
      .prepare(
        `UPDATE notifications
         SET state = 'sending', attempts = attempts + 1, updated_at = ?
         WHERE hub_id = ? AND idempotency_key = ? AND state = 'pending'`,
      )
      .bind(now, hubId, idempotencyKey),
    db
      .prepare(
        `UPDATE notifications
         SET state = 'sending', attempts = attempts + 1, updated_at = ?
         WHERE hub_id = ? AND idempotency_key = ? AND state = 'sending'
           AND updated_at < ?`,
      )
      .bind(now, hubId, idempotencyKey, claimLeaseCutoff),
    db
      .prepare(
        `SELECT id, hub_id, order_id, channel, destination, intended_at,
                idempotency_key, state, provider_message_id, attempts,
                last_error, created_at, updated_at
         FROM notifications
         WHERE hub_id = ? AND idempotency_key = ?`,
      )
      .bind(hubId, idempotencyKey),
  ]);

  const claimed =
    (results[1]?.meta.changes ?? 0) > 0 ||
    (results[2]?.meta.changes ?? 0) > 0;
  const rows = (results[3]?.results ?? []) as NotificationRow[];
  const row = rows[0];

  if (!row) {
    return { outcome: "not_eligible", intendedAt, notification: null };
  }

  const notification = mapNotification(row);
  if (claimed) {
    return {
      outcome: "claimed",
      intendedAt: notification.intendedAt,
      notification,
    };
  }

  if (row.state === "sent") {
    return {
      outcome: "already_sent",
      intendedAt: notification.intendedAt,
      notification,
    };
  }

  if (row.state === "suppressed") {
    return {
      outcome: "suppressed",
      intendedAt: notification.intendedAt,
      notification,
    };
  }

  if (row.state === "failed") {
    return {
      outcome: "failed",
      intendedAt: notification.intendedAt,
      notification,
    };
  }

  return {
    outcome: "in_progress",
    intendedAt: notification.intendedAt,
    notification,
  };
}

export async function suppressNotification(
  db: D1Database,
  hubId: string,
  input: NotificationSuppressRequest,
): Promise<NotificationSuppressResponse> {
  const now = input.now ?? Date.now();
  const intendedAt = input.intendedAt ?? now;
  const id = crypto.randomUUID();
  const idempotencyKey = notificationIdempotencyKey(
    hubId,
    input.orderId,
    input.targetVersion,
  );

  const results = await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO notifications (
          id, hub_id, order_id, channel, destination, intended_at,
          idempotency_key, state, attempts, last_error, created_at, updated_at
        )
        SELECT ?, o.hub_id, o.id, ?, c.phone, ?, ?, 'suppressed', 0, ?, ?, ?
        FROM orders o
        JOIN customers c
          ON c.id = o.customer_id AND c.hub_id = o.hub_id
        WHERE o.id = ? AND o.hub_id = ?`,
      )
      .bind(
        id,
        input.channel,
        intendedAt,
        idempotencyKey,
        input.reason,
        now,
        now,
        input.orderId,
        hubId,
      ),
    db
      .prepare(
        `UPDATE notifications
         SET state = 'suppressed', last_error = ?, updated_at = ?
         WHERE hub_id = ? AND idempotency_key = ? AND state = 'pending'`,
      )
      .bind(input.reason, now, hubId, idempotencyKey),
    db
      .prepare(
        `UPDATE outbox
         SET status = 'done', completed_at = ?, lease_token = NULL,
             lease_expires_at = NULL, last_error = NULL
         WHERE id = ? AND hub_id = ? AND destination = 'notification'
           AND status IN ('pending', 'dispatching', 'done')`,
      )
      .bind(now, input.outboxId, hubId),
    db
      .prepare(
        `SELECT id, hub_id, order_id, channel, destination, intended_at,
                idempotency_key, state, provider_message_id, attempts,
                last_error, created_at, updated_at
         FROM notifications
         WHERE hub_id = ? AND idempotency_key = ?`,
      )
      .bind(hubId, idempotencyKey),
  ]);

  const rows = (results[3]?.results ?? []) as NotificationRow[];
  const row = rows[0];
  const notification = row ? mapNotification(row) : null;

  return {
    suppressed: notification?.state === "suppressed",
    notification,
  };
}

function outcomeState(outcome: NotificationOutcome): NotificationState {
  switch (outcome) {
    case "sent":
      return "sent";
    case "retry":
      return "pending";
    case "failed":
    case "uncertain":
      return "failed";
  }
}

function outcomeErrorCode(
  outcome: NotificationOutcome,
  errorCode: string | null | undefined,
): string | null {
  if (outcome === "sent") {
    return null;
  }

  if (outcome === "uncertain") {
    return errorCode ? `${errorCode}_uncertain` : "provider_timeout_uncertain";
  }

  return errorCode ?? (outcome === "retry" ? "provider_retry" : "provider_failed");
}

export async function recordNotificationOutcome(
  db: D1Database,
  hubId: string,
  input: NotificationOutcomeRequest,
): Promise<NotificationOutcomeResponse> {
  const now = input.now ?? Date.now();
  const state = outcomeState(input.outcome);
  const lastError = outcomeErrorCode(input.outcome, input.errorCode);
  const providerMessageId =
    input.outcome === "sent" ? (input.providerMessageId ?? null) : null;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE notifications
         SET state = ?, provider_message_id = ?, last_error = ?, updated_at = ?
         WHERE id = ? AND hub_id = ? AND state IN ('pending', 'sending', 'failed')`,
      )
      .bind(state, providerMessageId, lastError, now, input.notificationId, hubId),
  ];

  if (input.outcome === "sent") {
    statements.push(
      db
        .prepare(
          `UPDATE orders
           SET last_notified_delivery_at = delivery_at, updated_at = ?
           WHERE id = (
             SELECT order_id FROM notifications WHERE id = ? AND hub_id = ?
           )
             AND hub_id = ?
             AND version = ?
             AND delivery_at IS NOT NULL`,
        )
        .bind(
          now,
          input.notificationId,
          hubId,
          hubId,
          input.targetVersion,
        ),
    );
  }

  if (input.outcome !== "retry" && input.outboxId) {
    statements.push(
      db
        .prepare(
          `UPDATE outbox
           SET status = 'done', completed_at = ?, lease_token = NULL,
               lease_expires_at = NULL, last_error = NULL
           WHERE id = ? AND hub_id = ? AND destination = 'notification'
             AND status IN ('pending', 'dispatching', 'done')`,
        )
        .bind(now, input.outboxId, hubId),
    );
  }

  statements.push(
    db
      .prepare(
        `SELECT id, hub_id, order_id, channel, destination, intended_at,
                idempotency_key, state, provider_message_id, attempts,
                last_error, created_at, updated_at
         FROM notifications
         WHERE id = ? AND hub_id = ?`,
      )
      .bind(input.notificationId, hubId),
  );

  const results = await db.batch(statements);
  const recorded = (results[0]?.meta.changes ?? 0) > 0;
  const rows = (results.at(-1)?.results ?? []) as NotificationRow[];
  const row = rows[0];

  return {
    recorded,
    notification: row ? mapNotification(row) : null,
  };
}
