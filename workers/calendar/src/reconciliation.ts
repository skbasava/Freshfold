import type {
  CalendarOrderState,
} from "../../../packages/contracts/src/calendar";
import {
  errorStatus,
  type GoogleCalendarEvent,
} from "../../../packages/calendar-client/src/client";
import type { CalendarEventApi } from "./consumer";
import type { LaundryCalendarClient } from "./laundry";
import {
  buildCanonicalEvent,
  eventOrderId,
  sameProjection,
} from "./projection";
import {
  runCalendarPoll,
  type CalendarPollResult,
  type CalendarPollerOptions,
} from "./poller";
import { recordRepair } from "./repairs";

export class ReconciliationError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "ReconciliationError";
  }
}

export type ReconciliationAlert = {
  code: "calendar_reconciliation_conflict";
  orderId?: string;
  eventId?: string;
  reason: string;
};

export type CalendarReconciliationOptions = {
  laundry: LaundryCalendarClient;
  calendar: CalendarEventApi;
  calendarId: string;
  hubId: string;
  now: number;
  pageSize?: number;
  logger?: (record: Record<string, unknown>) => void;
  onAlert?: (alert: ReconciliationAlert) => void;
  onMetric?: (name: string, value: number) => void;
  poll?: (
    options: CalendarPollerOptions,
  ) => Promise<CalendarPollResult>;
};

export type CalendarReconciliationResult = {
  status: "ok";
  ingested: CalendarPollResult;
  orders: number;
  events: number;
  healthy: number;
  enqueued: number;
  skippedPending: number;
  unresolved: number;
  drift: number;
  unknownEvents: number;
};

export async function runCalendarReconciliation(
  options: CalendarReconciliationOptions,
): Promise<CalendarReconciliationResult> {
  const pollerOptions: CalendarPollerOptions = {
    laundry: options.laundry,
    calendar: options.calendar,
    calendarId: options.calendarId,
    hubId: options.hubId,
    now: options.now,
    pageSize: options.pageSize,
    logger: options.logger,
    onMetric: options.onMetric,
  };

  let ingested: CalendarPollResult;
  try {
    ingested = options.poll
      ? await options.poll(pollerOptions)
      : await runCalendarPoll(pollerOptions);
  } catch (error) {
    throw new ReconciliationError(
      "calendar_reconciliation_ingest_failed",
      errorStatus(error),
    );
  }

  const orderStates = await listAllOrderStates(options);
  const events = await listAllEvents(options);
  const eventsById = new Map<string, GoogleCalendarEvent>();
  const eventsByOrderId = new Map<string, GoogleCalendarEvent>();
  const knownOrderIds = new Set(orderStates.map((state) => state.order.id));

  for (const event of events) {
    if (event.id) {
      eventsById.set(event.id, event);
    }
    const orderId = eventOrderId(event);
    if (orderId) {
      eventsByOrderId.set(orderId, event);
    }
  }

  let healthy = 0;
  let enqueued = 0;
  let skippedPending = 0;
  let unresolved = 0;
  let drift = 0;

  for (const state of orderStates) {
    const canonical = buildCanonicalEvent(state.order);
    if (!canonical || state.order.status === "cancelled") {
      continue;
    }

    const sync = state.calendarSync;
    if (!sync) {
      if (await options.laundry.enqueueUpsert(options.hubId, {
        orderId: state.order.id,
        targetVersion: state.order.version,
        now: options.now,
      })) {
        enqueued += 1;
        await recordRepair(options.laundry, {
          hubId: options.hubId,
          orderId: state.order.id,
          calendarId: options.calendarId,
          eventId: null,
          observedEtag: null,
          action: "reconciliation_missing_event",
          outcome: "repaired",
          detail: { queued: true, reason: "missing_projection" },
          now: options.now,
        });
      }
      continue;
    }

    if (state.order.version > sync.syncedVersion) {
      skippedPending += 1;
      options.logger?.({
        event: "calendar_reconciliation_pending_projection",
        orderId: state.order.id,
        orderVersion: state.order.version,
        syncedVersion: sync.syncedVersion,
      });
      continue;
    }

    const event =
      eventsById.get(sync.eventId) ?? eventsByOrderId.get(state.order.id);

    if (!event || event.status === "cancelled") {
      if (await options.laundry.enqueueUpsert(options.hubId, {
        orderId: state.order.id,
        targetVersion: state.order.version,
        now: options.now,
      })) {
        enqueued += 1;
        await recordRepair(options.laundry, {
          hubId: options.hubId,
          orderId: state.order.id,
          calendarId: options.calendarId,
          eventId: sync.eventId,
          observedEtag: event?.etag ?? null,
          action: "reconciliation_missing_event",
          outcome: "repaired",
          detail: { queued: true, reason: "missing_event" },
          now: options.now,
        });
      }
      continue;
    }

    if (sameProjection(event, state.order)) {
      healthy += 1;
      continue;
    }

    drift += 1;
    const unseenRevision =
      event.etag !== undefined &&
      sync.etag !== null &&
      event.etag !== sync.etag;

    if (unseenRevision) {
      unresolved += 1;
      await recordRepair(options.laundry, {
        hubId: options.hubId,
        orderId: state.order.id,
        calendarId: options.calendarId,
        eventId: event.id ?? sync.eventId,
        observedEtag: event.etag ?? null,
        action: "reconciliation_conflict",
        outcome: "unresolved",
        detail: {
          reason: "unprocessed_manager_edit",
          syncedEtag: sync.etag,
        },
        now: options.now,
      });
      options.onAlert?.({
        code: "calendar_reconciliation_conflict",
        orderId: state.order.id,
        eventId: event.id ?? sync.eventId,
        reason: "unprocessed_manager_edit",
      });
      options.logger?.({
        event: "calendar_reconciliation_conflict",
        orderId: state.order.id,
        eventId: event.id ?? sync.eventId,
      });
      continue;
    }

    if (await options.laundry.enqueueUpsert(options.hubId, {
      orderId: state.order.id,
      targetVersion: state.order.version,
      now: options.now,
    })) {
      enqueued += 1;
      await recordRepair(options.laundry, {
        hubId: options.hubId,
        orderId: state.order.id,
        calendarId: options.calendarId,
        eventId: event.id ?? sync.eventId,
        observedEtag: event.etag ?? null,
        action: "reconciliation_drift",
        outcome: "repaired",
        detail: { queued: true, reason: "projection_drift" },
        now: options.now,
      });
    }
  }

  const unknownEvents = events.filter((event) => {
    const orderId = eventOrderId(event);
    return !orderId || !knownOrderIds.has(orderId);
  }).length;

  options.onMetric?.("calendar_reconciliation_orders", orderStates.length);
  options.onMetric?.("calendar_reconciliation_healthy", healthy);
  options.onMetric?.("calendar_reconciliation_enqueued", enqueued);
  options.onMetric?.(
    "calendar_reconciliation_skipped_pending",
    skippedPending,
  );
  options.onMetric?.("calendar_reconciliation_unresolved", unresolved);
  options.onMetric?.("calendar_reconciliation_drift", drift);
  options.onMetric?.("calendar_reconciliation_unknown_events", unknownEvents);

  options.logger?.({
    event: "calendar_reconciliation_completed",
    orders: orderStates.length,
    events: events.length,
    healthy,
    enqueued,
    skippedPending,
    unresolved,
    drift,
    unknownEvents,
  });

  return {
    status: "ok",
    ingested,
    orders: orderStates.length,
    events: events.length,
    healthy,
    enqueued,
    skippedPending,
    unresolved,
    drift,
    unknownEvents,
  };
}

async function listAllOrderStates(
  options: CalendarReconciliationOptions,
): Promise<CalendarOrderState[]> {
  const items: CalendarOrderState[] = [];
  let cursor: string | null = null;

  do {
    const page = await options.laundry.listOrderStates(options.hubId, {
      limit: 100,
      cursor,
    });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  return items;
}

async function listAllEvents(
  options: CalendarReconciliationOptions,
): Promise<GoogleCalendarEvent[]> {
  const items: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    let page;
    try {
      page = await options.calendar.list({
        showDeleted: true,
        maxResults: Math.min(Math.max(options.pageSize ?? 2500, 1), 2500),
        ...(pageToken ? { pageToken } : {}),
      });
    } catch (error) {
      throw new ReconciliationError(
        "calendar_reconciliation_list_failed",
        errorStatus(error),
      );
    }
    items.push(...page.items);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return items;
}
