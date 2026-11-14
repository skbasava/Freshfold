import type {
  NotificationClaimRequest,
  NotificationClaimResponse,
  NotificationOrderState,
  NotificationOutcomeRequest,
  NotificationOutcomeResponse,
  NotificationSuppressRequest,
  NotificationSuppressResponse,
} from "../../../../packages/contracts/src/notifications";

export interface INotificationRepository {
  getOrderState(hubId: string, orderId: string): Promise<NotificationOrderState | null>;
  claim(
    hubId: string,
    request: NotificationClaimRequest,
  ): Promise<NotificationClaimResponse>;
  suppress(
    hubId: string,
    request: NotificationSuppressRequest,
  ): Promise<NotificationSuppressResponse>;
  recordOutcome(
    hubId: string,
    request: NotificationOutcomeRequest,
  ): Promise<NotificationOutcomeResponse>;
}

export interface INotificationService {
  getOrderState(hubId: string, orderId: string): Promise<NotificationOrderState | null>;
  claim(
    hubId: string,
    request: NotificationClaimRequest,
  ): Promise<NotificationClaimResponse>;
  suppress(
    hubId: string,
    request: NotificationSuppressRequest,
  ): Promise<NotificationSuppressResponse>;
  recordOutcome(
    hubId: string,
    request: NotificationOutcomeRequest,
  ): Promise<NotificationOutcomeResponse>;
}

