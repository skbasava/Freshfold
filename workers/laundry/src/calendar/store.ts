import {
  calendarRepairSchema,
  calendarSyncSchema,
  calendarSyncStateSchema,
  type CalendarOrderState,
  type CalendarProjectionRequest,
  type CalendarRepair,
  type CalendarRepairRequest,
  type CalendarSync,
  type CalendarSyncState,
  type CalendarSyncStatePutRequest,
} from "../../../../packages/contracts/src/calendar";
import { getOrder } from "../orders/read";

type CalendarSyncRecord = {
  order_id: string;
  hub_id: string;
  calendar_id: string;
  event_id: string;
  etag: string | null;
  synced_version: number;
  sync_status: "pending" | "synced" | "error" | "repairing";
  last_error: string | null;
  last_projected_at: number | null;
  updated_at: number;
};

type SyncStateRecord = {
  calendar_id: string;
  hub_id: string;
  sync_token: string | null;
  last_polled_at: number | null;
  last_full_sync_at: number | null;
  recovery_state: string;
  last_error: string | null;
  updated_at: number;
};

type CalendarRepairRecord = {
  id: string;
  hub_id: string;
  order_id: string | null;
  calendar_id: string;
  event_id: string | null;
  observed_etag: string | null;
  action: string;
  outcome: string;
  detail_json: string;
  created_at: number;
};

function mapCalendarSync(row: CalendarSyncRecord): CalendarSync {
  return calendarSyncSchema.parse({
    orderId: row.order_id,
    hubId: row.hub_id,
    calendarId: row.calendar_id,
    eventId: row.event_id,
    etag: row.etag,
    syncedVersion: row.synced_version,
    syncStatus: row.sync_status,
    lastError: row.last_error,
    lastProjectedAt: row.last_projected_at,
    updatedAt: row.updated_at,
  });
}

function mapSyncState(row: SyncStateRecord): CalendarSyncState {
  return calendarSyncStateSchema.parse({
    calendarId: row.calendar_id,
    hubId: row.hub_id,
    syncToken: row.sync_token,
    lastPolledAt: row.last_polled_at,
    lastFullSyncAt: row.last_full_sync_at,
    recoveryState: row.recovery_state,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  });
}

export async function getCalendarOrderState(
  db: D1Database,
  hubId: string,
  orderId: string,
): Promise<CalendarOrderState | null> {
  const order = await getOrder(db, hubId, orderId);
  if (!order) {
    return null;
  }

  const row = await db
    .prepare(
      `SELECT order_id, hub_id, calendar_id, event_id, etag, synced_version,
              sync_status, last_error, last_projected_at, updated_at
       FROM calendar_sync
       WHERE order_id = ? AND hub_id = ?`,
    )
    .bind(orderId, hubId)
    .first<CalendarSyncRecord>();

  return {
    order,
    calendarSync: row ? mapCalendarSync(row) : null,
  };
}

export async function upsertCalendarProjection(
  db: D1Database,
  hubId: string,
  orderId: string,
  input: CalendarProjectionRequest,
): Promise<{ updated: boolean; calendarSync: CalendarSync | null }> {
  const now = input.now ?? Date.now();
  const syncStatus = input.syncStatus ?? "synced";
  const result = await db
    .prepare(
      `INSERT INTO calendar_sync (
        order_id, hub_id, calendar_id, event_id, etag, synced_version,
        sync_status, last_error, last_projected_at, updated_at
      )
      SELECT id, hub_id, ?, ?, ?, ?, ?, ?, ?, ?
      FROM orders
      WHERE id = ? AND hub_id = ?
      ON CONFLICT(order_id) DO UPDATE SET
        calendar_id = excluded.calendar_id,
        event_id = excluded.event_id,
        etag = excluded.etag,
        synced_version = excluded.synced_version,
        sync_status = excluded.sync_status,
        last_error = excluded.last_error,
        last_projected_at = excluded.last_projected_at,
        updated_at = excluded.updated_at
      WHERE excluded.synced_version >= calendar_sync.synced_version`,
    )
    .bind(
      input.calendarId,
      input.eventId,
      input.etag,
      input.syncedVersion,
      syncStatus,
      input.lastError ?? null,
      now,
      now,
      orderId,
      hubId,
    )
    .run();

  const state = await getCalendarOrderState(db, hubId, orderId);
  return {
    updated: (result.meta.changes ?? 0) > 0,
    calendarSync: state?.calendarSync ?? null,
  };
}

export async function getCalendarSyncState(
  db: D1Database,
  hubId: string,
  calendarId: string,
): Promise<CalendarSyncState | null> {
  const row = await db
    .prepare(
      `SELECT calendar_id, hub_id, sync_token, last_polled_at, last_full_sync_at,
              recovery_state, last_error, updated_at
       FROM sync_state
       WHERE calendar_id = ? AND hub_id = ?`,
    )
    .bind(calendarId, hubId)
    .first<SyncStateRecord>();

  return row ? mapSyncState(row) : null;
}

// The route supplies the calendar ID separately; this wrapper keeps the request
// contract free of a redundant hub/calendar path mismatch.
export async function saveCalendarSyncStateForCalendar(
  db: D1Database,
  calendarId: string,
  input: CalendarSyncStatePutRequest,
): Promise<CalendarSyncState> {
  const now = input.now ?? Date.now();
  return saveState(db, { ...input, calendarId, now }, now);
}

async function saveState(
  db: D1Database,
  input: CalendarSyncStatePutRequest & { calendarId: string },
  now: number,
): Promise<CalendarSyncState> {
  const existing = await getCalendarSyncState(db, input.hubId, input.calendarId);
  const syncToken =
    input.syncToken === undefined ? (existing?.syncToken ?? null) : input.syncToken;
  const lastPolledAt =
    input.lastPolledAt === undefined
      ? (existing?.lastPolledAt ?? null)
      : input.lastPolledAt;
  const lastFullSyncAt =
    input.lastFullSyncAt === undefined
      ? (existing?.lastFullSyncAt ?? null)
      : input.lastFullSyncAt;
  const recoveryState = input.recoveryState ?? existing?.recoveryState ?? "idle";
  const lastError =
    input.lastError === undefined ? (existing?.lastError ?? null) : input.lastError;

  await db
    .prepare(
      `INSERT INTO sync_state (
        calendar_id, hub_id, sync_token, last_polled_at, last_full_sync_at,
        recovery_state, last_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(calendar_id) DO UPDATE SET
        hub_id = excluded.hub_id,
        sync_token = excluded.sync_token,
        last_polled_at = excluded.last_polled_at,
        last_full_sync_at = excluded.last_full_sync_at,
        recovery_state = excluded.recovery_state,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at`,
    )
    .bind(
      input.calendarId,
      input.hubId,
      syncToken,
      lastPolledAt,
      lastFullSyncAt,
      recoveryState,
      lastError,
      now,
    )
    .run();

  const saved = await getCalendarSyncState(db, input.hubId, input.calendarId);
  if (!saved) {
    throw new Error("sync_state_write_failed");
  }
  return saved;
}

export async function recordCalendarRepair(
  db: D1Database,
  input: CalendarRepairRequest,
): Promise<CalendarRepair> {
  const id = crypto.randomUUID();
  const createdAt = input.now ?? Date.now();
  const detailJson = JSON.stringify(input.detail ?? {});

  await db
    .prepare(
      `INSERT INTO calendar_repairs (
        id, hub_id, order_id, calendar_id, event_id, observed_etag,
        action, outcome, detail_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.hubId,
      input.orderId ?? null,
      input.calendarId,
      input.eventId ?? null,
      input.observedEtag ?? null,
      input.action,
      input.outcome,
      detailJson,
      createdAt,
    )
    .run();

  return calendarRepairSchema.parse({
    id,
    hubId: input.hubId,
    orderId: input.orderId ?? null,
    calendarId: input.calendarId,
    eventId: input.eventId ?? null,
    observedEtag: input.observedEtag ?? null,
    action: input.action,
    outcome: input.outcome,
    detail: input.detail ?? {},
    createdAt,
  });
}

export async function listCalendarOrderStates(
  db: D1Database,
  hubId: string,
  options: { limit: number; cursor: string | null },
): Promise<{ items: CalendarOrderState[]; nextCursor: string | null }> {
  const cursorClause = options.cursor ? "AND id > ?" : "";
  const bindings: Array<string | number> = [hubId];
  if (options.cursor) {
    bindings.push(options.cursor);
  }
  bindings.push(options.limit + 1);

  const rows = await db
    .prepare(
      `SELECT id FROM orders
       WHERE hub_id = ? ${cursorClause}
       ORDER BY id ASC
       LIMIT ?`,
    )
    .bind(...bindings)
    .all<{ id: string }>();

  const hasMore = rows.results.length > options.limit;
  const ids = rows.results.slice(0, options.limit).map((row) => row.id);
  const items: CalendarOrderState[] = [];
  for (const id of ids) {
    const state = await getCalendarOrderState(db, hubId, id);
    if (state) {
      items.push(state);
    }
  }

  return {
    items,
    nextCursor: hasMore ? (ids.at(-1) ?? null) : null,
  };
}

export async function completeCalendarOutbox(
  db: D1Database,
  hubId: string,
  outboxId: string,
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
       WHERE id = ? AND hub_id = ?
         AND status IN ('pending', 'dispatching', 'done')`,
    )
    .bind(now, outboxId, hubId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function enqueueCalendarUpsert(
  db: D1Database,
  hubId: string,
  orderId: string,
  targetVersion: number,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO outbox (
        id, hub_id, order_id, destination, operation, target_version,
        mutation_id, status, attempts, next_attempt_at, created_at
      )
      SELECT ?, hub_id, id, 'calendar', 'REPAIR_EVENT', version, ?,
             'pending', 0, ?, ?
      FROM orders
      WHERE id = ? AND hub_id = ? AND version = ?
      ON CONFLICT(order_id, destination, operation, target_version) DO UPDATE SET
        status = 'pending',
        attempts = 0,
        next_attempt_at = excluded.next_attempt_at,
        lease_token = NULL,
        lease_expires_at = NULL,
        last_error = NULL,
        completed_at = NULL
      WHERE outbox.status IN ('done', 'failed')`,
    )
    .bind(
      `repair:${orderId}:${targetVersion}`,
      `calendar-reconcile:${orderId}:${targetVersion}`,
      now,
      now,
      orderId,
      hubId,
      targetVersion,
    )
    .run();

  return (result.meta.changes ?? 0) > 0;
}
