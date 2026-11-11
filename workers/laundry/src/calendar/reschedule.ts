import type { InternalContext } from "../../../../packages/contracts/src/auth";
import type {
  CalendarRescheduleRequest,
  CalendarRescheduleResponse,
} from "../../../../packages/contracts/src/calendar";
import {
  applyChange,
  ApplyChangeError,
} from "../orders/apply-change";

export class CalendarRescheduleError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409 | 422 | 500,
  ) {
    super(code);
    this.name = "CalendarRescheduleError";
  }
}

type SlotRow = {
  id: string;
  starts_at: number;
  ends_at: number;
};

export async function rescheduleFromCalendar(
  db: D1Database,
  actor: InternalContext,
  input: CalendarRescheduleRequest,
  now: number,
): Promise<CalendarRescheduleResponse> {
  const sync = await db
    .prepare(
      `SELECT event_id FROM calendar_sync
       WHERE order_id = ? AND hub_id = ? AND calendar_id = ?`,
    )
    .bind(input.orderId, actor.hubId, input.calendarId)
    .first<{ event_id: string }>();

  if (sync && sync.event_id !== input.eventId) {
    throw new CalendarRescheduleError("CALENDAR_EVENT_MISMATCH", 409);
  }

  const slot = await db
    .prepare(
      `SELECT id, starts_at, ends_at FROM delivery_slots
       WHERE hub_id = ? AND starts_at = ? AND active = 1
       ORDER BY id ASC
       LIMIT 1`,
    )
    .bind(actor.hubId, input.startAt)
    .first<SlotRow>();

  if (!slot) {
    throw new CalendarRescheduleError("INVALID_SLOT", 422);
  }

  const calendarActor: InternalContext = {
    actorId: "system:calendar",
    actorType: "system",
    role: "manager",
    tenantId: actor.tenantId,
    hubId: actor.hubId,
    exp: actor.exp,
  };

  try {
    return await applyChange(
      db,
      calendarActor,
      {
        orderId: input.orderId,
        intent: "reschedule",
        payload: { deliverySlotId: slot.id },
        baseVersion: input.baseVersion,
        mutationId: input.mutationId,
      },
      { now },
    );
  } catch (error) {
    if (error instanceof ApplyChangeError) {
      throw new CalendarRescheduleError(error.code, error.status);
    }
    throw error;
  }
}
