import type { CalendarSync } from "../../../packages/contracts/src/calendar";
import type { OrderDetail } from "../../../packages/contracts/src/orders";
import type { GoogleCalendarEvent } from "../../../packages/calendar-client/src/client";
import {
  buildCanonicalEvent,
  eventEndMs,
  eventOrderId,
  eventProjectedVersion,
  eventStartMs,
  isTimedEvent,
  sameProjection,
} from "./projection";

const RESCHEDULABLE_STATUSES = new Set(["confirmed", "processing", "hold"]);

export type CalendarClassification =
  | {
      kind: "skip";
      reason:
        | "echo"
        | "canonical"
        | "pending_projection"
        | "missing_projection"
        | "inactive_order";
    }
  | {
      kind: "reschedule";
      startAt: number;
      endAt: number;
      projectedVersion: number;
    }
  | {
      kind: "restore";
      reason: "event_deleted" | "event_cancelled" | "event_status_changed";
    }
  | {
      kind: "revert";
      reason:
        | "all_day_event"
        | "recurrence_not_allowed"
        | "resize_not_allowed"
        | "forbidden_fields"
        | "past_reschedule"
        | "disallowed_status"
        | "invalid_time";
      fields: string[];
    };

export type ClassifyInput = {
  event: GoogleCalendarEvent | null;
  order: OrderDetail | null;
  sync: CalendarSync | null;
  now: number;
};

export function classifyEventChange(
  input: ClassifyInput,
): CalendarClassification {
  const { event, order, sync, now } = input;

  if (!order) {
    return { kind: "skip", reason: "inactive_order" };
  }

  if (!event || event.status === "cancelled") {
    if (order.status === "cancelled") {
      return { kind: "skip", reason: "inactive_order" };
    }
    return {
      kind: "restore",
      reason: event ? "event_cancelled" : "event_deleted",
    };
  }

  if (eventOrderId(event) !== null && eventOrderId(event) !== order.id) {
    return { kind: "skip", reason: "missing_projection" };
  }

  if (!sync) {
    return { kind: "skip", reason: "missing_projection" };
  }

  if (sync.syncedVersion < order.version) {
    return { kind: "skip", reason: "pending_projection" };
  }

  if (sync.etag && event.etag && sync.etag === event.etag) {
    return { kind: "skip", reason: "echo" };
  }

  if (sameProjection(event, order)) {
    return { kind: "skip", reason: "canonical" };
  }

  const canonical = buildCanonicalEvent(order);
  if (!canonical) {
    return { kind: "skip", reason: "inactive_order" };
  }

  if (!isTimedEvent(event)) {
    return { kind: "revert", reason: "all_day_event", fields: ["start", "end"] };
  }

  if (event.recurrence && event.recurrence.length > 0) {
    return {
      kind: "revert",
      reason: "recurrence_not_allowed",
      fields: ["recurrence"],
    };
  }

  if (event.status !== undefined && event.status !== "confirmed") {
    return { kind: "restore", reason: "event_status_changed" };
  }

  const startAt = eventStartMs(event);
  const endAt = eventEndMs(event);
  const canonicalStart = eventStartMs(canonical);
  const canonicalEnd = eventEndMs(canonical);
  if (
    startAt === null ||
    endAt === null ||
    canonicalStart === null ||
    canonicalEnd === null
  ) {
    return { kind: "revert", reason: "invalid_time", fields: ["start", "end"] };
  }

  const startChanged = startAt !== canonicalStart;
  const endChanged = endAt !== canonicalEnd;
  const durationUnchanged =
    endAt - startAt === canonicalEnd - canonicalStart;
  const fields = changedFields(event, canonical);

  if (startChanged) {
    if (!durationUnchanged) {
      return {
        kind: "revert",
        reason: "resize_not_allowed",
        fields: ["start", "end"],
      };
    }

    if (fields.length > 0) {
      return { kind: "revert", reason: "forbidden_fields", fields };
    }

    if (!RESCHEDULABLE_STATUSES.has(order.status)) {
      return {
        kind: "revert",
        reason: "disallowed_status",
        fields: ["start", "end"],
      };
    }

    if (startAt <= now) {
      return {
        kind: "revert",
        reason: "past_reschedule",
        fields: ["start", "end"],
      };
    }

    return {
      kind: "reschedule",
      startAt,
      endAt,
      projectedVersion: sync.syncedVersion,
    };
  }

  if (endChanged) {
    return {
      kind: "revert",
      reason: "resize_not_allowed",
      fields: ["end"],
    };
  }

  if (fields.length > 0) {
    return { kind: "revert", reason: "forbidden_fields", fields };
  }

  return { kind: "skip", reason: "canonical" };
}

function changedFields(
  event: GoogleCalendarEvent,
  canonical: GoogleCalendarEvent,
): string[] {
  const fields: string[] = [];
  if (event.summary !== canonical.summary) {
    fields.push("summary");
  }
  if (event.description !== canonical.description) {
    fields.push("description");
  }
  if ((event.colorId ?? null) !== (canonical.colorId ?? null)) {
    fields.push("colorId");
  }
  if (
    event.extendedProperties?.private?.orderId !==
      canonical.extendedProperties?.private?.orderId ||
    eventProjectedVersion(event) !== eventProjectedVersion(canonical)
  ) {
    fields.push("extendedProperties");
  }
  if (event.status !== undefined && event.status !== "confirmed") {
    fields.push("status");
  }
  return fields;
}
