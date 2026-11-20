import type {
  NotificationDispatchResult,
  OutboundNotificationMessage,
} from "../entities/notification.entity";

export interface INotificationService {
  send(message: OutboundNotificationMessage): Promise<NotificationDispatchResult>;
  sendBatch(
    messages: OutboundNotificationMessage[],
  ): Promise<NotificationDispatchResult[]>;
}
