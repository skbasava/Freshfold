import type { CalendarRepairResponse } from "../../../packages/contracts/src/calendar";
import type { LaundryCalendarClient } from "./laundry";

export type RepairAction =
  | "revert_forbidden_fields"
  | "revert_resize"
  | "revert_all_day"
  | "revert_recurrence"
  | "revert_past_reschedule"
  | "revert_disallowed_status"
  | "restore_event"
  | "rejected_reschedule"
  | "reconciliation_missing_event"
  | "reconciliation_drift"
  | "reconciliation_conflict";

export type RepairOutcome = "repaired" | "restored" | "rejected" | "unresolved";

export type RepairInput = {
  hubId: string;
  orderId: string | null;
  calendarId: string;
  eventId: string | null;
  observedEtag: string | null;
  action: RepairAction;
  outcome: RepairOutcome;
  detail: Record<string, unknown>;
  now: number;
};

export async function recordRepair(
  laundry: LaundryCalendarClient,
  input: RepairInput,
): Promise<CalendarRepairResponse> {
  return laundry.recordRepair(input.hubId, {
    hubId: input.hubId,
    orderId: input.orderId,
    calendarId: input.calendarId,
    eventId: input.eventId,
    observedEtag: input.observedEtag,
    action: input.action,
    outcome: input.outcome,
    detail: input.detail,
    now: input.now,
  });
}
