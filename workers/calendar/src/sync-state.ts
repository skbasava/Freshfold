import type { CalendarSyncState } from "../../../packages/contracts/src/calendar";
import type { LaundryCalendarClient } from "./laundry";

export type LoadedSyncState = {
  state: CalendarSyncState | null;
  syncToken: string | null;
};

export async function loadSyncState(
  laundry: LaundryCalendarClient,
  hubId: string,
  calendarId: string,
): Promise<LoadedSyncState> {
  const state = await laundry.getSyncState(hubId, calendarId);
  return {
    state,
    syncToken: state?.syncToken ?? null,
  };
}

export async function beginFullResync(
  laundry: LaundryCalendarClient,
  input: {
    hubId: string;
    calendarId: string;
    now: number;
    reason: string;
  },
): Promise<void> {
  await laundry.saveSyncState(input.hubId, input.calendarId, {
    hubId: input.hubId,
    syncToken: null,
    recoveryState: "full_sync",
    lastError: input.reason,
    now: input.now,
  });
}

export async function persistPollSuccess(
  laundry: LaundryCalendarClient,
  input: {
    hubId: string;
    calendarId: string;
    now: number;
    nextSyncToken: string | null;
    previousSyncToken: string | null;
    fullSync: boolean;
  },
): Promise<void> {
  await laundry.saveSyncState(input.hubId, input.calendarId, {
    hubId: input.hubId,
    syncToken: input.nextSyncToken ?? input.previousSyncToken,
    lastPolledAt: input.now,
    ...(input.fullSync ? { lastFullSyncAt: input.now } : {}),
    recoveryState: "idle",
    lastError: null,
    now: input.now,
  });
}
