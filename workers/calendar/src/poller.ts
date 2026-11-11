import type { CalendarOrderState } from "../../../packages/contracts/src/calendar";
import {
  errorStatus,
  type GoogleCalendarEvent,
} from "../../../packages/calendar-client/src/client";
import {
  classifyEventChange,
  type CalendarClassification,
} from "./classify";
import type { CalendarEventApi } from "./consumer";
import type { LaundryCalendarClient } from "./laundry";
import { sameProjection } from "./projection";
import type { RepairAction } from "./repairs";
import { revertToCanonical } from "./revert";
import {
  METRICS,
  OBSERVABILITY_EVENTS,
} from "../../../packages/shared/src/observability";
import {
  beginFullResync,
  loadSyncState,
  persistPollSuccess,
} from "./sync-state";

export class CalendarPollError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "CalendarPollError";
  }
}

export type CalendarPollerOptions = {
  laundry: LaundryCalendarClient;
  calendar: CalendarEventApi;
  calendarId: string;
  hubId: string;
  now: number;
  pageSize?: number;
  logger?: (record: Record<string, unknown>) => void;
  onMetric?: (name: string, value: number) => void;
};

export type CalendarPollResult = {
  status: "ok";
  fullSync: boolean;
  pages: number;
  processed: number;
  rescheduled: number;
  reverts: number;
  restores: number;
  skipped: number;
  unknown: number;
  nextSyncToken: string | null;
};

type PollState = {
  fullSync: boolean;
  pages: number;
  processed: number;
  rescheduled: number;
  reverts: number;
  restores: number;
  skipped: number;
  unknown: number;
};

export async function runCalendarPoll(
  options: CalendarPollerOptions,
): Promise<CalendarPollResult> {
  const loaded = await loadSyncState(
    options.laundry,
    options.hubId,
    options.calendarId,
  );

  if (!loaded.syncToken) {
    return pollOnce(options, null, true);
  }

  try {
    return await pollOnce(options, loaded.syncToken, false);
  } catch (error) {
    if (errorStatus(error) !== 410) {
      throw error;
    }

    options.logger?.({
      event: "calendar_sync_token_invalid",
      calendarId: options.calendarId,
      hubId: options.hubId,
    });
    options.onMetric?.(METRICS.syncTokenResets, 1);

    await beginFullResync(options.laundry, {
      hubId: options.hubId,
      calendarId: options.calendarId,
      now: options.now,
      reason: "sync_token_invalid",
    });

    return pollOnce(options, null, true);
  }
}

async function pollOnce(
  options: CalendarPollerOptions,
  syncToken: string | null,
  fullSync: boolean,
): Promise<CalendarPollResult> {
  const state: PollState = {
    fullSync,
    pages: 0,
    processed: 0,
    rescheduled: 0,
    reverts: 0,
    restores: 0,
    skipped: 0,
    unknown: 0,
  };
  const orderCache = new Map<string, CalendarOrderState | null>();
  let pageToken: string | undefined;
  let nextSyncToken: string | null = syncToken;
  const maxResults = Math.min(Math.max(options.pageSize ?? 2500, 1), 2500);

  try {
    do {
      const page = await options.calendar.list({
        ...(syncToken ? { syncToken } : {}),
        ...(pageToken ? { pageToken } : {}),
        showDeleted: true,
        maxResults,
      });
      state.pages += 1;

      for (const event of page.items) {
        state.processed += 1;
        await processEvent(options, event, orderCache, state);
      }

      if (page.nextPageToken) {
        pageToken = page.nextPageToken;
      } else {
        pageToken = undefined;
        if (page.nextSyncToken) {
          nextSyncToken = page.nextSyncToken;
        }
      }
    } while (pageToken);
  } catch (error) {
    const status = errorStatus(error);
    options.logger?.({
      event: "calendar_poll_failed",
      calendarId: options.calendarId,
      hubId: options.hubId,
      status,
    });
    throw new CalendarPollError("calendar_poll_failed", status);
  }

  await persistPollSuccess(options.laundry, {
    hubId: options.hubId,
    calendarId: options.calendarId,
    now: options.now,
    nextSyncToken,
    previousSyncToken: syncToken,
    fullSync,
  });

  options.logger?.({
    event: "calendar_poll_completed",
    calendarId: options.calendarId,
    hubId: options.hubId,
    fullSync,
    pages: state.pages,
    processed: state.processed,
    rescheduled: state.rescheduled,
    reverts: state.reverts,
    restores: state.restores,
    skipped: state.skipped,
    unknown: state.unknown,
  });

  return {
    status: "ok",
    fullSync: state.fullSync,
    pages: state.pages,
    processed: state.processed,
    rescheduled: state.rescheduled,
    reverts: state.reverts,
    restores: state.restores,
    skipped: state.skipped,
    unknown: state.unknown,
    nextSyncToken,
  };
}

async function processEvent(
  options: CalendarPollerOptions,
  event: GoogleCalendarEvent,
  cache: Map<string, CalendarOrderState | null>,
  state: PollState,
): Promise<void> {
  const orderId = event.extendedProperties?.private?.orderId;
  if (!orderId) {
    state.unknown += 1;
    options.logger?.({
      event: "calendar_event_unknown",
      calendarId: options.calendarId,
      eventId: event.id,
    });
    return;
  }

  let orderState = cache.get(orderId);
  if (orderState === undefined) {
    orderState = await options.laundry.getOrderState(options.hubId, orderId);
    cache.set(orderId, orderState);
  }

  if (!orderState) {
    state.unknown += 1;
    options.logger?.({
      event: "calendar_event_order_missing",
      calendarId: options.calendarId,
      orderId,
      eventId: event.id,
    });
    return;
  }

  const classification: CalendarClassification = classifyEventChange({
    event,
    order: orderState.order,
    sync: orderState.calendarSync,
    now: options.now,
  });

  if (classification.kind === "skip") {
    state.skipped += 1;
    return;
  }

  if (classification.kind === "restore") {
    const result = await revertToCanonical({
      laundry: options.laundry,
      calendar: options.calendar,
      calendarId: options.calendarId,
      hubId: options.hubId,
      order: orderState.order,
      event: event.status === "cancelled" ? event : null,
      observedEtag: event.etag ?? null,
      action: "restore_event",
      reason: classification.reason,
      fields: ["status"],
      now: options.now,
      evaluate: (candidate) =>
        candidate === null || candidate.status === "cancelled",
    });
    if (result.outcome === "restored" || result.outcome === "repaired") {
      state.restores += 1;
      options.onMetric?.(METRICS.calendarReverts, 1);
      options.logger?.({
        event: OBSERVABILITY_EVENTS.calendarRevert,
        calendarId: options.calendarId,
        hubId: options.hubId,
        orderId,
        eventId: event.id,
        reason: classification.reason,
        outcome: result.outcome,
      });
    } else {
      state.skipped += 1;
    }
    return;
  }

  if (classification.kind === "revert") {
    const reverted = await revertToCanonical({
      laundry: options.laundry,
      calendar: options.calendar,
      calendarId: options.calendarId,
      hubId: options.hubId,
      order: orderState.order,
      event,
      observedEtag: event.etag ?? null,
      action: actionForReason(classification.reason),
      reason: classification.reason,
      fields: classification.fields,
      now: options.now,
      evaluate: (candidate) =>
        candidate === null ||
        candidate.status === "cancelled" ||
        !sameProjection(candidate, orderState.order),
    });
    if (reverted.outcome === "already_canonical") {
      state.skipped += 1;
    } else {
      state.reverts += 1;
      options.onMetric?.(METRICS.calendarReverts, 1);
      options.logger?.({
        event: OBSERVABILITY_EVENTS.calendarRevert,
        calendarId: options.calendarId,
        hubId: options.hubId,
        orderId,
        eventId: event.id,
        reason: classification.reason,
        outcome: reverted.outcome,
      });
    }
    return;
  }

  try {
    const result = await options.laundry.reschedule(options.hubId, {
      orderId,
      eventId: event.id ?? orderState.calendarSync?.eventId ?? "",
      calendarId: options.calendarId,
      startAt: classification.startAt,
      endAt: classification.endAt,
      baseVersion: classification.projectedVersion,
      mutationId: `calendar:${event.id}:${event.etag ?? classification.startAt}`,
    });

    state.rescheduled += 1;
    cache.set(orderId, { ...orderState, order: result.order });
    options.logger?.({
      event: "calendar_reschedule_applied",
      calendarId: options.calendarId,
      hubId: options.hubId,
      orderId,
      eventId: event.id,
      newVersion: result.order.version,
    });
  } catch (error) {
    const status = errorStatus(error);
    if (status === 429 || status === 0 || status >= 500) {
      throw new CalendarPollError("calendar_reschedule_transient", status);
    }

    const reverted = await revertToCanonical({
      laundry: options.laundry,
      calendar: options.calendar,
      calendarId: options.calendarId,
      hubId: options.hubId,
      order: orderState.order,
      event,
      observedEtag: event.etag ?? null,
      action: "rejected_reschedule",
      reason: `reschedule_rejected_${status}`,
      fields: ["start", "end"],
      now: options.now,
      evaluate: (candidate) =>
        candidate === null ||
        candidate.status === "cancelled" ||
        !sameProjection(candidate, orderState.order),
    });
    if (reverted.outcome !== "already_canonical") {
      state.reverts += 1;
      options.onMetric?.(METRICS.calendarReverts, 1);
    }
    options.logger?.({
      event: "calendar_reschedule_rejected",
      calendarId: options.calendarId,
      hubId: options.hubId,
      orderId,
      eventId: event.id,
      status,
      outcome: reverted.outcome,
    });
  }
}

function actionForReason(
  reason: Extract<CalendarClassification, { kind: "revert" }>["reason"],
): RepairAction {
  switch (reason) {
    case "all_day_event":
      return "revert_all_day";
    case "recurrence_not_allowed":
      return "revert_recurrence";
    case "resize_not_allowed":
      return "revert_resize";
    case "past_reschedule":
      return "revert_past_reschedule";
    case "disallowed_status":
      return "revert_disallowed_status";
    case "forbidden_fields":
    case "invalid_time":
      return "revert_forbidden_fields";
  }
}
