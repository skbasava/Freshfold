import type { OrderDetail } from "../../../packages/contracts/src/orders";
import type {
  GoogleCalendarEvent,
  NewGoogleCalendarEvent,
} from "../../../packages/calendar-client/src/client";

export const CALENDAR_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;

const BASE32HEX_ALPHABET = "0123456789abcdefghijklmnopqrstuv";

export function deterministicEventId(orderId: string): string {
  const encoded = base32Hex(new TextEncoder().encode(orderId));
  const prefixed = `ord${encoded}`;
  if (prefixed.length >= 5 && prefixed.length <= 1024) {
    return prefixed;
  }

  if (prefixed.length > 1024) {
    return prefixed.slice(0, 1024);
  }

  return prefixed.padEnd(5, "0");
}

export function buildCanonicalEvent(
  order: OrderDetail,
): NewGoogleCalendarEvent | null {
  if (order.deliveryAt === null) {
    return null;
  }

  const startAt = order.deliveryAt;
  const endAt = startAt + DEFAULT_EVENT_DURATION_MS;
  const itemCount = order.items.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  return {
    id: deterministicEventId(order.id),
    summary: `Deliver ${formatLocalTime(startAt)} · ${order.id}`,
    description: `${order.serviceType} · ${itemCount} item${
      itemCount === 1 ? "" : "s"
    } · Order ${order.id}`,
    start: {
      dateTime: new Date(startAt).toISOString(),
      timeZone: CALENDAR_TIMEZONE,
    },
    end: {
      dateTime: new Date(endAt).toISOString(),
      timeZone: CALENDAR_TIMEZONE,
    },
    extendedProperties: {
      private: {
        orderId: order.id,
        projectedVersion: String(order.version),
      },
    },
  };
}

export function buildCanonicalPatch(
  order: OrderDetail,
): Partial<GoogleCalendarEvent> | null {
  const canonical = buildCanonicalEvent(order);
  if (!canonical) {
    return null;
  }

  return {
    summary: canonical.summary,
    description: canonical.description,
    start: canonical.start,
    end: canonical.end,
    recurrence: [],
    colorId: null,
    status: "confirmed",
    extendedProperties: canonical.extendedProperties,
  };
}

export function eventOrderId(event: GoogleCalendarEvent): string | null {
  const value = event.extendedProperties?.private?.orderId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function eventProjectedVersion(event: GoogleCalendarEvent): number | null {
  const value = event.extendedProperties?.private?.projectedVersion;
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function eventStartMs(event: GoogleCalendarEvent): number | null {
  return dateTimeMs(event.start);
}

export function eventEndMs(event: GoogleCalendarEvent): number | null {
  return dateTimeMs(event.end);
}

export function isTimedEvent(event: GoogleCalendarEvent): boolean {
  return eventStartMs(event) !== null && eventEndMs(event) !== null;
}

export function sameProjection(
  event: GoogleCalendarEvent,
  order: OrderDetail,
): boolean {
  const canonical = buildCanonicalEvent(order);
  if (!canonical) {
    return event.status === "cancelled";
  }

  if (event.status !== undefined && event.status !== "confirmed") {
    return false;
  }

  return (
    event.summary === canonical.summary &&
    event.description === canonical.description &&
    sameDateTime(event.start, canonical.start) &&
    sameDateTime(event.end, canonical.end) &&
    relationshipEqual(event) &&
    recurrenceEmpty(event) &&
    (event.colorId ?? null) === null &&
    eventOrderId(event) === order.id &&
    eventProjectedVersion(event) === order.version
  );
}

function relationshipEqual(event: GoogleCalendarEvent): boolean {
  return (
    event.extendedProperties?.private?.orderId === eventOrderId(event) &&
    event.extendedProperties?.private?.projectedVersion ===
      String(eventProjectedVersion(event))
  );
}

function recurrenceEmpty(event: GoogleCalendarEvent): boolean {
  return event.recurrence === undefined || event.recurrence.length === 0;
}

function sameDateTime(
  left: GoogleCalendarEvent["start"] | GoogleCalendarEvent["end"],
  right: GoogleCalendarEvent["start"] | GoogleCalendarEvent["end"],
): boolean {
  if (!left || !right) {
    return false;
  }

  if ("date" in left || "date" in right) {
    return (
      "date" in left &&
      "date" in right &&
      left.date === right.date
    );
  }

  const leftMs = Date.parse(left.dateTime);
  const rightMs = Date.parse(right.dateTime);
  return Number.isFinite(leftMs) && leftMs === rightMs;
}

function dateTimeMs(
  value: GoogleCalendarEvent["start"] | GoogleCalendarEvent["end"],
): number | null {
  if (!value || !("dateTime" in value)) {
    return null;
  }

  const parsed = Date.parse(value.dateTime);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatLocalTime(epochMs: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: CALENDAR_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(epochMs))
    .replace(/\s+/g, " ");
}

function base32Hex(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32HEX_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32HEX_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}
