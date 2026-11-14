import type {
  NotificationClaimRequest,
  NotificationClaimResponse,
  NotificationOrderState,
  NotificationOutcomeRequest,
  NotificationOutcomeResponse,
  NotificationSuppressRequest,
  NotificationSuppressResponse,
} from "../../../../packages/contracts/src/notifications";
import type { Logger } from "../../../../packages/shared/src/observability";
import type {
  INotificationRepository,
  INotificationService,
} from "../interfaces/notification.interface";

export class NotificationService implements INotificationService {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly logger?: Logger,
  ) {}

  async getOrderState(
    hubId: string,
    orderId: string,
  ): Promise<NotificationOrderState | null> {
    this.logger?.debug("notification_service_get_order_state_requested", {
      hubId,
      orderId,
    });
    return this.notificationRepo.getOrderState(hubId, orderId);
  }

  async claim(
    hubId: string,
    request: NotificationClaimRequest,
  ): Promise<NotificationClaimResponse> {
    this.logger?.debug("notification_service_claim_requested", {
      hubId,
      orderId: request.orderId,
      outboxId: request.outboxId,
    });
    return this.notificationRepo.claim(hubId, request);
  }

  async suppress(
    hubId: string,
    request: NotificationSuppressRequest,
  ): Promise<NotificationSuppressResponse> {
    this.logger?.debug("notification_service_suppress_requested", {
      hubId,
      orderId: request.orderId,
    });
    return this.notificationRepo.suppress(hubId, request);
  }

  async recordOutcome(
    hubId: string,
    request: NotificationOutcomeRequest,
  ): Promise<NotificationOutcomeResponse> {
    this.logger?.debug("notification_service_record_outcome_requested", {
      hubId,
      notificationId: request.notificationId,
    });
    return this.notificationRepo.recordOutcome(hubId, request);
  }
}

