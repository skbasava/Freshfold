export type NotificationChannel = "whatsapp" | "sms";

export type OutboundNotification = {
  to: string;
  channel: NotificationChannel;
  body: string;
  idempotencyKey?: string;
};

export type ProviderSendResult = {
  id: string;
};

export interface NotificationProviderAdapter {
  readonly channel: NotificationChannel;
  readonly supportsIdempotency: boolean;
  send(message: OutboundNotification): Promise<ProviderSendResult>;
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
