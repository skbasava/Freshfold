import {
  calendarEnqueueUpsertRequestSchema,
  calendarEnqueueUpsertResponseSchema,
  calendarOrderListResponseSchema,
  calendarOrderStateSchema,
  calendarOutboxCompleteRequestSchema,
  calendarOutboxCompleteResponseSchema,
  calendarProjectionRequestSchema,
  calendarProjectionResponseSchema,
  calendarRepairRequestSchema,
  calendarRepairResponseSchema,
  calendarRescheduleRequestSchema,
  calendarRescheduleResponseSchema,
  calendarSyncStateResponseSchema,
  calendarSyncStatePutRequestSchema,
  type CalendarEnqueueUpsertRequest,
  type CalendarOrderListResponse,
  type CalendarOrderState,
  type CalendarProjectionRequest,
  type CalendarProjectionResponse,
  type CalendarRepairRequest,
  type CalendarRepairResponse,
  type CalendarRescheduleRequest,
  type CalendarRescheduleResponse,
  type CalendarSyncState,
  type CalendarSyncStatePutRequest,
} from "../../../packages/contracts/src/calendar";
import {
  SERVICE_HUB_HEADER,
  SERVICE_NAME_HEADER,
  SERVICE_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
} from "../../../packages/contracts/src/http";

const LAUNDRY_ORIGIN = "https://laundry.internal";

export class LaundryCalendarError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = "LaundryCalendarError";
  }
}

export type LaundryCalendarClientOptions = {
  LAUNDRY: Fetcher;
  SERVICE_TOKEN?: string;
};

export class LaundryCalendarClient {
  private readonly laundry: Fetcher;
  private readonly serviceToken: string | undefined;

  constructor(options: LaundryCalendarClientOptions) {
    this.laundry = options.LAUNDRY;
    this.serviceToken = options.SERVICE_TOKEN;
  }

  async getOrderState(
    hubId: string,
    orderId: string,
  ): Promise<CalendarOrderState | null> {
    const response = await this.request(
      `/internal/calendar/orders/${encodeURIComponent(orderId)}`,
      hubId,
    );
    if (response.status === 404) {
      return null;
    }
    return calendarOrderStateSchema.parse(await this.requireJson(response, "calendar_order_reload_failed"));
  }

  async saveProjection(
    hubId: string,
    orderId: string,
    input: CalendarProjectionRequest,
  ): Promise<CalendarProjectionResponse> {
    const body = calendarProjectionRequestSchema.parse(input);
    const response = await this.request(
      `/internal/calendar/orders/${encodeURIComponent(orderId)}/projection`,
      hubId,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return calendarProjectionResponseSchema.parse(
      await this.requireJson(response, "calendar_projection_write_failed"),
    );
  }

  async getSyncState(
    hubId: string,
    calendarId: string,
  ): Promise<CalendarSyncState | null> {
    const response = await this.request(
      `/internal/calendar/sync-state?calendarId=${encodeURIComponent(calendarId)}`,
      hubId,
    );
    const payload = calendarSyncStateResponseSchema.parse(
      await this.requireJson(response, "calendar_sync_state_read_failed"),
    );
    return payload.state;
  }

  async saveSyncState(
    hubId: string,
    calendarId: string,
    input: CalendarSyncStatePutRequest,
  ): Promise<CalendarSyncState> {
    const body = calendarSyncStatePutRequestSchema.parse(input);
    const response = await this.request(
      `/internal/calendar/sync-state?calendarId=${encodeURIComponent(calendarId)}`,
      hubId,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
    const payload = calendarSyncStateResponseSchema.parse(
      await this.requireJson(response, "calendar_sync_state_write_failed"),
    );
    if (!payload.state) {
      throw new LaundryCalendarError("calendar_sync_state_write_failed", 500);
    }
    return payload.state;
  }

  async recordRepair(
    hubId: string,
    input: CalendarRepairRequest,
  ): Promise<CalendarRepairResponse> {
    const body = calendarRepairRequestSchema.parse(input);
    const response = await this.request(
      "/internal/calendar/repairs",
      hubId,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return calendarRepairResponseSchema.parse(
      await this.requireJson(response, "calendar_repair_write_failed"),
    );
  }

  async listOrderStates(
    hubId: string,
    options: { limit?: number; cursor?: string | null } = {},
  ): Promise<CalendarOrderListResponse> {
    const search = new URLSearchParams();
    if (options.limit !== undefined) {
      search.set("limit", String(options.limit));
    }
    if (options.cursor) {
      search.set("cursor", options.cursor);
    }
    const suffix = search.toString() ? `?${search.toString()}` : "";
    const response = await this.request(
      `/internal/calendar/orders${suffix}`,
      hubId,
    );
    return calendarOrderListResponseSchema.parse(
      await this.requireJson(response, "calendar_orders_list_failed"),
    );
  }

  async reschedule(
    hubId: string,
    input: CalendarRescheduleRequest,
  ): Promise<CalendarRescheduleResponse> {
    const body = calendarRescheduleRequestSchema.parse(input);
    const response = await this.request(
      "/internal/calendar/reschedule",
      hubId,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return calendarRescheduleResponseSchema.parse(
      await this.requireJson(response, "calendar_reschedule_failed"),
    );
  }

  async completeOutbox(
    hubId: string,
    outboxId: string,
    now: number,
  ): Promise<boolean> {
    const body = calendarOutboxCompleteRequestSchema.parse({ outboxId, now });
    const response = await this.request(
      "/internal/calendar/outbox/complete",
      hubId,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    const payload = calendarOutboxCompleteResponseSchema.parse(
      await this.requireJson(response, "calendar_outbox_complete_failed"),
    );
    return payload.completed;
  }

  async enqueueUpsert(
    hubId: string,
    input: CalendarEnqueueUpsertRequest,
  ): Promise<boolean> {
    const body = calendarEnqueueUpsertRequestSchema.parse(input);
    const response = await this.request(
      "/internal/calendar/enqueue",
      hubId,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    const payload = calendarEnqueueUpsertResponseSchema.parse(
      await this.requireJson(response, "calendar_enqueue_failed"),
    );
    return payload.enqueued;
  }

  private async request(
    path: string,
    hubId: string,
    init: RequestInit = {},
  ): Promise<Response> {
    if (!this.serviceToken) {
      throw new LaundryCalendarError("service_token_missing", 0);
    }

    const headers = new Headers(init.headers);
    headers.set(SERVICE_TOKEN_HEADER, this.serviceToken);
    headers.set(SERVICE_NAME_HEADER, "calendar");
    headers.set(SERVICE_TENANT_HEADER, "system");
    headers.set(SERVICE_HUB_HEADER, hubId);
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    return this.laundry.fetch(`${LAUNDRY_ORIGIN}${path}`, {
      ...init,
      headers,
    });
  }

  private async requireJson(
    response: Response,
    code: string,
  ): Promise<unknown> {
    if (!response.ok) {
      throw new LaundryCalendarError(code, response.status);
    }
    return response.json();
  }
}
