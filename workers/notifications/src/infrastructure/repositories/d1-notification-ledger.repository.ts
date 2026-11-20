import type {
  CreateNotificationLogInput,
  INotificationLedgerRepository,
  NotificationLogRecord,
} from "../../domain/interfaces/notification-ledger.repository.interface";

export class D1NotificationLedgerRepository implements INotificationLedgerRepository {
  constructor(private readonly db: D1Database) {}

  async createLog(input: CreateNotificationLogInput): Promise<NotificationLogRecord> {
    const id = input.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const nowIso = new Date().toISOString();
    const status = input.status || "queued";
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    await this.db
      .prepare(
        `INSERT INTO notification_logs (
          id, tenant_id, channel, provider, recipient, subject, body,
          template_id, status, idempotency_key, metadata_json, retry_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .bind(
        id,
        input.tenantId,
        input.channel,
        input.provider,
        input.recipient,
        input.subject || null,
        input.body,
        input.templateId || null,
        status,
        input.idempotencyKey || null,
        metadataJson,
        nowIso,
      )
      .run();

    return {
      id,
      tenantId: input.tenantId,
      channel: input.channel,
      provider: input.provider,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      templateId: input.templateId,
      status,
      idempotencyKey: input.idempotencyKey,
      metadataJson,
      retryCount: 0,
      createdAt: nowIso,
    };
  }

  async markStatus(
    id: string,
    status: "sent" | "failed" | "sending",
    data?: { providerMessageId?: string; errorMessage?: string; sentAtIso?: string },
  ): Promise<void> {
    const sentAt = data?.sentAtIso || (status === "sent" ? new Date().toISOString() : null);

    await this.db
      .prepare(
        `UPDATE notification_logs
         SET status = ?, provider_message_id = COALESCE(?, provider_message_id),
             error_message = COALESCE(?, error_message), sent_at = COALESCE(?, sent_at)
         WHERE id = ?`,
      )
      .bind(
        status,
        data?.providerMessageId || null,
        data?.errorMessage || null,
        sentAt,
        id,
      )
      .run();
  }

  async findByIdempotencyKey(
    tenantId: number,
    idempotencyKey: string,
  ): Promise<NotificationLogRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM notification_logs WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
      )
      .bind(tenantId, idempotencyKey)
      .first<any>();

    if (!row) return null;
    return this.mapRow(row);
  }

  async getLog(id: string): Promise<NotificationLogRecord | null> {
    const row = await this.db
      .prepare(`SELECT * FROM notification_logs WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<any>();

    if (!row) return null;
    return this.mapRow(row);
  }

  private mapRow(row: any): NotificationLogRecord {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      channel: row.channel,
      provider: row.provider,
      recipient: row.recipient,
      subject: row.subject,
      body: row.body,
      templateId: row.template_id,
      status: row.status,
      providerMessageId: row.provider_message_id,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      idempotencyKey: row.idempotency_key,
      metadataJson: row.metadata_json,
      createdAt: row.created_at,
      sentAt: row.sent_at,
    };
  }
}
