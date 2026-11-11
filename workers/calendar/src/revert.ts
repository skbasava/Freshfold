import type { OrderDetail } from "../../../packages/contracts/src/orders";
import {
  errorStatus,
  type GoogleCalendarEvent,
} from "../../../packages/calendar-client/src/client";
import type { CalendarEventApi } from "./consumer";
import type { LaundryCalendarClient } from "./laundry";
import {
  buildCanonicalEvent,
  buildCanonicalPatch,
} from "./projection";
import {
  recordRepair,
  type RepairAction,
  type RepairOutcome,
} from "./repairs";

export class RevertError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "RevertError";
  }
}

export type RevertInput = {
  laundry: LaundryCalendarClient;
  calendar: CalendarEventApi;
  calendarId: string;
  hubId: string;
  order: OrderDetail;
  event: GoogleCalendarEvent | null;
  observedEtag: string | null;
  action: RepairAction;
  reason: string;
  fields: string[];
  now: number;
  evaluate?: (event: GoogleCalendarEvent | null) => boolean;
  maxAttempts?: number;
};

export type RevertOutcome = {
  outcome: "repaired" | "restored" | "already_canonical";
  event: GoogleCalendarEvent | null;
  etag: string | null;
  attempts: number;
};

export async function revertToCanonical(
  input: RevertInput,
): Promise<RevertOutcome> {
  const canonical = buildCanonicalEvent(input.order);
  const patch = buildCanonicalPatch(input.order);
  if (!canonical || !patch) {
    return {
      outcome: "already_canonical",
      event: input.event,
      etag: input.event?.etag ?? null,
      attempts: 0,
    };
  }

  const eventId = input.event?.id ?? canonical.id;
  const maxAttempts = input.maxAttempts ?? 3;
  let current = input.event;
  let deleted = current === null || current.status === "cancelled";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (current === null || current.status === "cancelled") {
        try {
          current = await input.calendar.insert(canonical);
          deleted = true;
        } catch (error) {
          lastStatus = errorStatus(error);
          if (lastStatus !== 409) {
            throw error;
          }
          current = (await input.calendar.get(eventId)) ?? null;
          if (!current) {
            continue;
          }
        }
      } else if (input.evaluate && !input.evaluate(current)) {
        return {
          outcome: "already_canonical",
          event: current,
          etag: current.etag ?? null,
          attempts: attempt,
        };
      }

      const currentBeforeWrite = current;
      if (currentBeforeWrite === null) {
        continue;
      }

      const result = await input.calendar.patch(eventId, patch, {
        etag: currentBeforeWrite.etag ?? null,
      });

      await input.laundry.saveProjection(input.hubId, input.order.id, {
        calendarId: input.calendarId,
        eventId,
        etag: result.etag ?? null,
        syncedVersion: input.order.version,
        syncStatus: "synced",
        now: input.now,
      });

      const outcome: RepairOutcome = deleted ? "restored" : "repaired";
      await recordRepair(input.laundry, {
        hubId: input.hubId,
        orderId: input.order.id,
        calendarId: input.calendarId,
        eventId,
        observedEtag: input.observedEtag,
        action: input.action,
        outcome,
        detail: {
          reason: input.reason,
          fields: input.fields,
          attempts: attempt,
        },
        now: input.now,
      });

      return {
        outcome: deleted ? "restored" : "repaired",
        event: result,
        etag: result.etag ?? null,
        attempts: attempt,
      };
    } catch (error) {
      lastStatus = errorStatus(error);
      if (lastStatus === 412) {
        current = (await input.calendar.get(eventId)) ?? null;
        if (input.evaluate && !input.evaluate(current)) {
          return {
            outcome: "already_canonical",
            event: current,
            etag: current?.etag ?? null,
            attempts: attempt,
          };
        }
        continue;
      }

      await recordUnresolved(input, eventId, lastStatus, attempt);
      throw new RevertError("calendar_revert_failed", lastStatus);
    }
  }

  await recordUnresolved(input, eventId, lastStatus, maxAttempts);
  throw new RevertError("calendar_revert_unresolved", lastStatus);
}

async function recordUnresolved(
  input: RevertInput,
  eventId: string,
  status: number,
  attempts: number,
): Promise<void> {
  try {
    await recordRepair(input.laundry, {
      hubId: input.hubId,
      orderId: input.order.id,
      calendarId: input.calendarId,
      eventId,
      observedEtag: input.observedEtag,
      action: input.action,
      outcome: "unresolved",
      detail: {
        reason: input.reason,
        fields: input.fields,
        attempts,
        status,
      },
      now: input.now,
    });
  } catch {
    // The provider failure is the actionable error; repair logging is best effort.
  }
}

