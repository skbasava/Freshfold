import type {
  OutboundNotificationMessage,
} from "../entities/notification.entity";
import type {
  TenantEmailConfig,
  TenantPushConfig,
  TenantSmsConfig,
  TenantWhatsConfig,
} from "../entities/tenant-config.entity";

export interface ProviderAdapterResult {
  messageId: string;
  rawResponse?: unknown;
}

export interface IEmailProviderAdapter {
  readonly providerName: string;
  sendEmail(
    config: TenantEmailConfig,
    message: OutboundNotificationMessage,
  ): Promise<ProviderAdapterResult>;
}

export interface IWhatsAppProviderAdapter {
  readonly providerName: string;
  sendWhatsApp(
    config: TenantWhatsConfig,
    message: OutboundNotificationMessage,
  ): Promise<ProviderAdapterResult>;
}

export interface ISmsProviderAdapter {
  readonly providerName: string;
  sendSms(
    config: TenantSmsConfig,
    message: OutboundNotificationMessage,
  ): Promise<ProviderAdapterResult>;
}

export interface IPushProviderAdapter {
  readonly providerName: string;
  sendPush(
    config: TenantPushConfig,
    message: OutboundNotificationMessage,
  ): Promise<ProviderAdapterResult>;
}
