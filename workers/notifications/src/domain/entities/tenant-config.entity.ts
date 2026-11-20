export type EmailProviderType = "brevo" | "resend";
export type WhatsAppProviderType = "openwa" | "whatsapp_cloud";
export type SmsProviderType = "generic_http";
export type PushProviderType = "web_push";

export interface TenantEmailConfig {
  provider: EmailProviderType;
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

export interface TenantWhatsConfig {
  provider: WhatsAppProviderType;
  // OpenWA self-hosted session configuration
  openwaBaseUrl?: string;
  openwaApiKey?: string;
  openwaSessionName?: string;
  // Official Meta WhatsApp Cloud API credentials
  whatsappAccessToken?: string;
  whatsappPhoneNumberId?: string;
  whatsappWabaId?: string;
}

export interface TenantSmsConfig {
  provider: SmsProviderType;
  endpointUrl: string;
  httpMethod: "GET" | "POST";
  apiKey: string;
  senderId?: string;
  authHeaderName?: string; // Default: 'Authorization'
  authHeaderPrefix?: string; // Default: 'Bearer '
  toParamName?: string; // Default: 'to' or 'numbers'
  messageParamName?: string; // Default: 'message' or 'body'
  customHeaders?: Record<string, string>;
  extraQueryParams?: Record<string, string>;
}

export interface TenantPushConfig {
  provider: PushProviderType;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  subject?: string;
}

export interface TenantNotificationConfig {
  tenantId: number;
  tenantCode?: string;
  email?: TenantEmailConfig;
  whatsapp?: TenantWhatsConfig;
  sms?: TenantSmsConfig;
  push?: TenantPushConfig;
  isDefaultPlatformConfig?: boolean;
  updatedAtIso: string;
}
