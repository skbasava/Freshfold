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
import {
  METRICS,
  OBSERVABILITY_EVENTS,
  type Logger,
} from "../../../../packages/shared/src/observability";
import type {
  ICalendarRepository,
  ICalendarService,
} from "../interfaces/calendar.interface";
import { applyChange, ApplyChangeError } from "./order.service";

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

async function rescheduleFromCalendar(
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

export class CalendarService implements ICalendarService {
  constructor(
    private readonly calendarRepo: ICalendarRepository,
    private readonly db: D1Database,
    private readonly logger?: Logger,
  ) {}

  async getOrderState(
    hubId: string,
    orderId: string,
  ): Promise<CalendarOrderState | null> {
    this.logger?.debug("calendar_service_get_order_state_requested", {
      hubId,
      orderId,
    });
    return this.calendarRepo.getOrderState(hubId, orderId);
  }

  async listOrderStates(
    hubId: string,
    query: { limit: number; cursor: string | null },
  ): Promise<CalendarOrderListResponse> {
    this.logger?.debug("calendar_service_list_order_states_requested", {
      hubId,
      limit: query.limit,
      cursor: query.cursor,
    });
    return this.calendarRepo.listOrderStates(hubId, query);
  }

  async upsertProjection(
    hubId: string,
    orderId: string,
    projection: CalendarProjectionRequest,
  ): Promise<CalendarProjectionResponse> {
    this.logger?.debug("calendar_service_upsert_projection_requested", {
      hubId,
      orderId,
      calendarId: projection.calendarId,
    });
    return this.calendarRepo.upsertProjection(hubId, orderId, projection);
  }

  async getSyncState(
    hubId: string,
    calendarId: string,
  ): Promise<CalendarSyncState | null> {
    this.logger?.debug("calendar_service_get_sync_state_requested", {
      hubId,
      calendarId,
    });
    return this.calendarRepo.getSyncState(hubId, calendarId);
  }

  async saveSyncState(
    calendarId: string,
    state: CalendarSyncStatePutRequest,
  ): Promise<CalendarSyncState> {
    this.logger?.debug("calendar_service_save_sync_state_requested", {
      hubId: state.hubId,
      calendarId,
    });
    return this.calendarRepo.saveSyncState(calendarId, state);
  }

  async recordRepair(repair: CalendarRepairRequest): Promise<CalendarRepair> {
    this.logger?.debug("calendar_service_record_repair_requested", {
      hubId: repair.hubId,
      action: repair.action,
    });
    return this.calendarRepo.recordRepair(repair);
  }

  async reschedule(
    actor: InternalContext,
    request: CalendarRescheduleRequest,
    now: number,
  ): Promise<CalendarRescheduleResponse> {
    this.logger?.debug("calendar_service_reschedule_requested", {
      hubId: actor.hubId,
      orderId: request.orderId,
    });

    try {
      const result = await rescheduleFromCalendar(
        this.db,
        actor,
        request,
        now,
      );

      this.logger?.info("calendar_service_reschedule_success", {
        hubId: actor.hubId,
        orderId: request.orderId,
        version: result.order.version,
      });

      return result;
    } catch (error) {
      if (error instanceof CalendarRescheduleError) {
        if (error.code === "VERSION_CONFLICT") {
          this.logger?.warn(OBSERVABILITY_EVENTS.mutationConflict, {
            orderId: request.orderId,
            code: error.code,
            actorType: actor.actorType,
          });
          this.logger?.metric(METRICS.mutationConflicts, 1, {
            reason: error.code,
          });
        }

        if (error.code === "SLOT_FULL") {
          this.logger?.warn(OBSERVABILITY_EVENTS.capacityRejection, {
            orderId: request.orderId,
            code: error.code,
            actorType: actor.actorType,
          });
          this.logger?.metric(METRICS.capacityRejections, 1, {
            reason: error.code,
          });
        }
      }
      throw error;
    }
  }

  async completeOutbox(
    hubId: string,
    outboxId: string,
    now: number,
  ): Promise<boolean> {
    this.logger?.debug("calendar_service_complete_outbox_requested", {
      hubId,
      outboxId,
    });
    return this.calendarRepo.completeOutbox(hubId, outboxId, now);
  }

  async enqueueUpsert(
    hubId: string,
    orderId: string,
    targetVersion: number,
    now: number,
  ): Promise<boolean> {
    this.logger?.debug("calendar_service_enqueue_upsert_requested", {
      hubId,
      orderId,
      targetVersion,
    });
    return this.calendarRepo.enqueueUpsert(hubId, orderId, targetVersion, now);
  }
}
