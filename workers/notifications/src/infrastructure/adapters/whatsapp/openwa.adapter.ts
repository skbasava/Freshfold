import type { OutboundNotificationMessage } from "../../../domain/entities/notification.entity";
import type { TenantWhatsConfig } from "../../../domain/entities/tenant-config.entity";
import type {
  IWhatsAppProviderAdapter,
  ProviderAdapterResult,
} from "../../../domain/interfaces/provider-adapters.interface";

export class OpenWaAdapter implements IWhatsAppProviderAdapter {
  readonly providerName = "openwa";

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async sendWhatsApp(
    config: TenantWhatsConfig,
    message: OutboundNotificationMessage,
  ): Promise<ProviderAdapterResult> {
    const baseUrl = config.openwaBaseUrl?.replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("OpenWA baseUrl is not configured for tenant");
    }

    // Normalize phone number to digits only, e.g. '919876543210@c.us'
    const digitsOnly = message.recipient.replace(/[^0-9]/g, "");
    const formattedChatId = digitsOnly.endsWith("@c.us")
      ? digitsOnly
      : `${digitsOnly}@c.us`;

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };

    if (config.openwaApiKey) {
      headers["api-key"] = config.openwaApiKey;
      headers["authorization"] = `Bearer ${config.openwaApiKey}`;
    }

    const payload = {
      chatId: formattedChatId,
      content: message.body,
      session: config.openwaSessionName || "default",
    };

    const response = await this.fetchFn(`${baseUrl}/api/sendText`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`OpenWA send failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      response?: string;
    };
    return {
      messageId: data.id || data.response || `openwa_${Date.now()}`,
      rawResponse: data,
    };
  }
}
