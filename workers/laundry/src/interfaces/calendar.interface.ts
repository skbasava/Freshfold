import type {
  CalendarOrderListResponse,
  CalendarOrderState,
  CalendarProjectionRequest,
  CalendarProjectionResponse,
  CalendarRepair,
  CalendarRepairRequest,
  CalendarRescheduleRequest,
  CalendarRescheduleResponse,
  CalendarSyncState,
  CalendarSyncStatePutRequest,
} from "../../../../packages/contracts/src/calendar";
import type { InternalContext } from "../../../../packages/contracts/src/auth";

export interface ICalendarRepository {
  getOrderState(hubId: string, orderId: string): Promise<CalendarOrderState | null>;
  listOrderStates(
    hubId: string,
    options: { limit: number; cursor: string | null },
  ): Promise<CalendarOrderListResponse>;
  upsertProjection(
    hubId: string,
    orderId: string,
    projection: CalendarProjectionRequest,
  ): Promise<CalendarProjectionResponse>;
  getSyncState(hubId: string, calendarId: string): Promise<CalendarSyncState | null>;
  saveSyncState(
    calendarId: string,
    state: CalendarSyncStatePutRequest,
  ): Promise<CalendarSyncState>;
  recordRepair(repair: CalendarRepairRequest): Promise<CalendarRepair>;
  completeOutbox(
    hubId: string,
    outboxId: string,
    now: number,
  ): Promise<boolean>;
  enqueueUpsert(
    hubId: string,
    orderId: string,
    targetVersion: number,
    now: number,
  ): Promise<boolean>;
}

export interface ICalendarService {
  getOrderState(hubId: string, orderId: string): Promise<CalendarOrderState | null>;
  listOrderStates(
    hubId: string,
    query: { limit: number; cursor: string | null },
  ): Promise<CalendarOrderListResponse>;
  upsertProjection(
    hubId: string,
    orderId: string,
    projection: CalendarProjectionRequest,
  ): Promise<CalendarProjectionResponse>;
  getSyncState(hubId: string, calendarId: string): Promise<CalendarSyncState | null>;
  saveSyncState(
    calendarId: string,
    state: CalendarSyncStatePutRequest,
  ): Promise<CalendarSyncState>;
  recordRepair(repair: CalendarRepairRequest): Promise<CalendarRepair>;
  reschedule(
    actor: InternalContext,
    request: CalendarRescheduleRequest,
    now: number,
  ): Promise<CalendarRescheduleResponse>;
  completeOutbox(
    hubId: string,
    outboxId: string,
    now: number,
  ): Promise<boolean>;
  enqueueUpsert(
    hubId: string,
    orderId: string,
    targetVersion: number,
    now: number,
  ): Promise<boolean>;
}

