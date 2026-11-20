export interface NotificationLogRecord {
  id: string;
  tenantId: number;
  channel: "email" | "whatsapp" | "sms" | "push";
  provider: string;
  recipient: string;
  subject?: string | null;
  body: string;
  templateId?: string | null;
  status: "queued" | "sending" | "sent" | "failed";
  providerMessageId?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  idempotencyKey?: string | null;
  metadataJson?: string | null;
  createdAt: string;
  sentAt?: string | null;
}

export interface CreateNotificationLogInput {
  id?: string;
  tenantId: number;
  channel: "email" | "whatsapp" | "sms" | "push";
  provider: string;
  recipient: string;
  subject?: string | null;
  body: string;
  templateId?: string | null;
  status?: "queued" | "sending" | "sent" | "failed";
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface INotificationLedgerRepository {
  createLog(input: CreateNotificationLogInput): Promise<NotificationLogRecord>;
  markStatus(
    id: string,
    status: "sent" | "failed" | "sending",
    data?: { providerMessageId?: string; errorMessage?: string; sentAtIso?: string },
  ): Promise<void>;
  findByIdempotencyKey(
    tenantId: number,
    idempotencyKey: string,
  ): Promise<NotificationLogRecord | null>;
  getLog(id: string): Promise<NotificationLogRecord | null>;
}
