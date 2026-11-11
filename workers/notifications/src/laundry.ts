import {
  notificationClaimResponseSchema,
  notificationOrderStateSchema,
  notificationOutcomeResponseSchema,
  notificationSuppressResponseSchema,
  type NotificationClaimRequest,
  type NotificationClaimResponse,
  type NotificationOrderState,
  type NotificationOutcomeRequest,
  type NotificationOutcomeResponse,
  type NotificationSuppressRequest,
  type NotificationSuppressResponse,
} from "../../../packages/contracts/src/notifications";
import {
  SERVICE_HUB_HEADER,
  SERVICE_NAME_HEADER,
  SERVICE_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
} from "../../../packages/contracts/src/http";

export class LaundryRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "LaundryRequestError";
  }
}

export class NotificationLaundryClient {
  constructor(
    private readonly options: {
      LAUNDRY: Fetcher;
      SERVICE_TOKEN: string;
      now?: () => number;
    },
  ) {}

  async getOrderState(
    hubId: string,
    orderId: string,
  ): Promise<NotificationOrderState | null> {
    const response = await this.fetch(
      hubId,
      `/internal/notifications/orders/${encodeURIComponent(orderId)}`,
      { method: "GET" },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new LaundryRequestError(response.status, "order_reload_failed");
    }

    const parsed = notificationOrderStateSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new LaundryRequestError(response.status, "order_state_invalid");
    }

    return parsed.data;
  }

  async claim(
    hubId: string,
    input: NotificationClaimRequest,
  ): Promise<NotificationClaimResponse> {
    const response = await this.fetch(hubId, "/internal/notifications/claim", {
      method: "POST",
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new LaundryRequestError(response.status, "notification_claim_failed");
    }

    const parsed = notificationClaimResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new LaundryRequestError(response.status, "claim_response_invalid");
    }

    return parsed.data;
  }

  async suppress(
    hubId: string,
    input: NotificationSuppressRequest,
  ): Promise<NotificationSuppressResponse> {
    const response = await this.fetch(
      hubId,
      "/internal/notifications/suppress",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );

    if (!response.ok) {
      throw new LaundryRequestError(
        response.status,
        "notification_suppress_failed",
      );
    }

    const parsed = notificationSuppressResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new LaundryRequestError(
        response.status,
        "suppress_response_invalid",
      );
    }

    return parsed.data;
  }

  async recordOutcome(
    hubId: string,
    input: NotificationOutcomeRequest,
  ): Promise<NotificationOutcomeResponse> {
    const response = await this.fetch(
      hubId,
      "/internal/notifications/outcome",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );

    if (!response.ok) {
      throw new LaundryRequestError(
        response.status,
        "notification_outcome_failed",
      );
    }

    const parsed = notificationOutcomeResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new LaundryRequestError(
        response.status,
        "outcome_response_invalid",
      );
    }

    return parsed.data;
  }

  private fetch(
    hubId: string,
    path: string,
    init: { method: string; body?: string },
  ): Promise<Response> {
    return this.options.LAUNDRY.fetch(`https://laundry.internal${path}`, {
      method: init.method,
      headers: {
        [SERVICE_TOKEN_HEADER]: this.options.SERVICE_TOKEN,
        [SERVICE_NAME_HEADER]: "notifications",
        [SERVICE_TENANT_HEADER]: "system",
        [SERVICE_HUB_HEADER]: hubId,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      ...(init.body ? { body: init.body } : {}),
    });
  }
}
