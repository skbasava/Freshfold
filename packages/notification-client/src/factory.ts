import { SmsProviderAdapter, type SmsProviderOptions } from "./sms";
import type { NotificationProviderAdapter } from "./types";
import {
  WhatsAppProviderAdapter,
  type WhatsAppProviderOptions,
} from "./whatsapp";

export type NotificationProviderConfig =
  | ({ channel: "whatsapp" } & WhatsAppProviderOptions)
  | ({ channel: "sms" } & SmsProviderOptions);

export function createNotificationProvider(
  config: NotificationProviderConfig,
): NotificationProviderAdapter {
  if (config.channel === "whatsapp") {
    const { channel: _channel, ...options } = config;
    return new WhatsAppProviderAdapter(options);
  }

  const { channel: _channel, ...options } = config;
  return new SmsProviderAdapter(options);
}
