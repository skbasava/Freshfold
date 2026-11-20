import type {
  NotificationDispatchResult,
  OutboundNotificationMessage,
} from "../../domain/entities/notification.entity";
import type { INotificationLedgerRepository } from "../../domain/interfaces/notification-ledger.repository.interface";
import type { INotificationService } from "../../domain/interfaces/notification-service.interface";
import type {
  IEmailProviderAdapter,
  IPushProviderAdapter,
  ISmsProviderAdapter,
  IWhatsAppProviderAdapter,
} from "../../domain/interfaces/provider-adapters.interface";
import type { ITenantConfigRepository } from "../../domain/interfaces/tenant-config.repository.interface";

export interface NotificationServiceAdapters {
  emailAdapters: Record<string, IEmailProviderAdapter>; // 'brevo' | 'resend'
  whatsappAdapters: Record<string, IWhatsAppProviderAdapter>; // 'openwa' | 'whatsapp_cloud'
  smsAdapters: Record<string, ISmsProviderAdapter>; // 'generic_http'
  pushAdapters: Record<string, IPushProviderAdapter>; // 'web_push'
}

export class NotificationService implements INotificationService {
  constructor(
    private readonly tenantConfigRepo: ITenantConfigRepository,
    private readonly adapters: NotificationServiceAdapters,
    private readonly ledgerRepo?: INotificationLedgerRepository,
  ) {}

  async send(message: OutboundNotificationMessage): Promise<NotificationDispatchResult> {
    const tenantId = message.tenantId || 1;
    const nowIso = new Date().toISOString();

    // 1. Check idempotency in ledger if key provided
    if (this.ledgerRepo && message.idempotencyKey) {
      const existing = await this.ledgerRepo.findByIdempotencyKey(
        tenantId,
        message.idempotencyKey,
      );
      if (existing && existing.status === "sent") {
        return {
          success: true,
          channel: existing.channel,
          provider: existing.provider,
          recipient: existing.recipient,
          messageId: existing.providerMessageId || existing.id,
          sentAtIso: existing.sentAt || existing.createdAt,
        };
      }
    }

    const tenantConfig = await this.tenantConfigRepo.getTenantConfig(tenantId);

    if (!tenantConfig) {
      return {
        success: false,
        channel: message.channel,
        provider: "unknown",
        recipient: message.recipient,
        error: `No notification configuration found for tenant ${tenantId}`,
        sentAtIso: nowIso,
      };
    }

    // 2. Create pending record in D1 ledger
    let logId: string | null = null;
    let providerName = "unknown";

    if (message.channel === "email") {
      providerName = tenantConfig.email?.provider || "brevo";
    } else if (message.channel === "whatsapp") {
      providerName = tenantConfig.whatsapp?.provider || "openwa";
    } else if (message.channel === "sms") {
      providerName = tenantConfig.sms?.provider || "generic_http";
    } else if (message.channel === "push") {
      providerName = tenantConfig.push?.provider || "web_push";
    }

    if (this.ledgerRepo) {
      try {
        const log = await this.ledgerRepo.createLog({
          id: message.id,
          tenantId,
          channel: message.channel,
          provider: providerName,
          recipient: message.recipient,
          subject: message.subject,
          body: message.body,
          templateId: message.templateId,
          status: "sending",
          idempotencyKey: message.idempotencyKey,
          metadata: message.metadata,
        });
        logId = log.id;
      } catch (logErr) {
        console.warn("Failed to create D1 notification ledger log:", logErr);
      }
    }

    try {
      let dispatchResult: NotificationDispatchResult;

      switch (message.channel) {
        case "email": {
          const emailConfig = tenantConfig.email;
          if (!emailConfig) {
            throw new Error(`Email provider is not configured for tenant ${tenantId}`);
          }
          const adapter = this.adapters.emailAdapters[emailConfig.provider];
          if (!adapter) {
            throw new Error(`Unsupported email provider: ${emailConfig.provider}`);
          }
          const result = await adapter.sendEmail(emailConfig, message);
          dispatchResult = {
            success: true,
            channel: "email",
            provider: emailConfig.provider,
            recipient: message.recipient,
            messageId: result.messageId,
            sentAtIso: nowIso,
          };
          break;
        }

        case "whatsapp": {
          const whatsappConfig = tenantConfig.whatsapp;
          if (!whatsappConfig) {
            throw new Error(`WhatsApp provider is not configured for tenant ${tenantId}`);
          }
          const adapter = this.adapters.whatsappAdapters[whatsappConfig.provider];
          if (!adapter) {
            throw new Error(`Unsupported WhatsApp provider: ${whatsappConfig.provider}`);
          }
          const result = await adapter.sendWhatsApp(whatsappConfig, message);
          dispatchResult = {
            success: true,
            channel: "whatsapp",
            provider: whatsappConfig.provider,
            recipient: message.recipient,
            messageId: result.messageId,
            sentAtIso: nowIso,
          };
          break;
        }

        case "sms": {
          const smsConfig = tenantConfig.sms;
          if (!smsConfig) {
            throw new Error(`SMS provider is not configured for tenant ${tenantId}`);
          }
          const adapter = this.adapters.smsAdapters[smsConfig.provider];
          if (!adapter) {
            throw new Error(`Unsupported SMS provider: ${smsConfig.provider}`);
          }
          const result = await adapter.sendSms(smsConfig, message);
          dispatchResult = {
            success: true,
            channel: "sms",
            provider: smsConfig.provider,
            recipient: message.recipient,
            messageId: result.messageId,
            sentAtIso: nowIso,
          };
          break;
        }

        case "push": {
          const pushConfig = tenantConfig.push;
          if (!pushConfig) {
            throw new Error(`Push notification provider is not configured for tenant ${tenantId}`);
          }
          const adapter = this.adapters.pushAdapters[pushConfig.provider];
          if (!adapter) {
            throw new Error(`Unsupported push provider: ${pushConfig.provider}`);
          }
          const result = await adapter.sendPush(pushConfig, message);
          dispatchResult = {
            success: true,
            channel: "push",
            provider: pushConfig.provider,
            recipient: message.recipient,
            messageId: result.messageId,
            sentAtIso: nowIso,
          };
          break;
        }

        default:
          throw new Error(`Unsupported notification channel: ${(message as any).channel}`);
      }

      // 3. Update ledger on success
      if (this.ledgerRepo && logId) {
        await this.ledgerRepo.markStatus(logId, "sent", {
          providerMessageId: dispatchResult.messageId,
          sentAtIso: dispatchResult.sentAtIso,
        }).catch(() => null);
      }

      return dispatchResult;
    } catch (err: any) {
      const errorMessage = err?.message || String(err);

      // 4. Update ledger on failure
      if (this.ledgerRepo && logId) {
        await this.ledgerRepo.markStatus(logId, "failed", {
          errorMessage,
        }).catch(() => null);
      }

      return {
        success: false,
        channel: message.channel,
        provider: providerName,
        recipient: message.recipient,
        error: errorMessage,
        sentAtIso: nowIso,
      };
    }
  }

  async sendBatch(
    messages: OutboundNotificationMessage[],
  ): Promise<NotificationDispatchResult[]> {
    return Promise.all(messages.map((msg) => this.send(msg)));
  }
}
