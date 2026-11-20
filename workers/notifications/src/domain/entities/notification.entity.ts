export type NotificationChannel = "email" | "whatsapp" | "sms" | "push";

export type NotificationPriority = "high" | "normal" | "low";

export interface OutboundNotificationAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface OutboundNotificationMessage {
  id?: string;
  tenantId: number;
  channel: NotificationChannel;
  recipient: string; // Email address, E.164 phone number, or push token/endpoint
  subject?: string;
  body: string;
  templateId?: string;
  templateVariables?: Record<string, string | number>;
  metadata?: Record<string, unknown>;
  attachments?: OutboundNotificationAttachment[];
  idempotencyKey?: string;
}

export interface NotificationDispatchResult {
  success: boolean;
  channel: NotificationChannel;
  provider: string;
  recipient: string;
  messageId?: string;
  error?: string;
  sentAtIso: string;
}
