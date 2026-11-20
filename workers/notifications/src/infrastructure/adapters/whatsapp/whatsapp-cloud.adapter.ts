import type { OutboundNotificationMessage } from "../../../domain/entities/notification.entity";
import type { TenantWhatsConfig } from "../../../domain/entities/tenant-config.entity";
import type {
  IWhatsAppProviderAdapter,
  ProviderAdapterResult,
} from "../../../domain/interfaces/provider-adapters.interface";

export class WhatsAppCloudAdapter implements IWhatsAppProviderAdapter {
  readonly providerName = "whatsapp_cloud";

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async sendWhatsApp(
    config: TenantWhatsConfig,
    message: OutboundNotificationMessage,
  ): Promise<ProviderAdapterResult> {
    if (!config.whatsappAccessToken || !config.whatsappPhoneNumberId) {
      throw new Error(
        "WhatsApp Cloud API accessToken or phoneNumberId is not configured for tenant",
      );
    }

    const digitsOnly = message.recipient.replace(/[^0-9]/g, "");
    const url = `https://graph.facebook.com/v19.0/${config.whatsappPhoneNumberId}/messages`;

    let payload: Record<string, unknown>;

    if (message.templateId) {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: digitsOnly,
        type: "template",
        template: {
          name: message.templateId,
          language: { code: "en_US" },
          components: message.templateVariables
            ? [
                {
                  type: "body",
                  parameters: Object.entries(message.templateVariables).map(
                    ([, val]) => ({
                      type: "text",
                      text: String(val),
                    }),
                  ),
                },
              ]
            : undefined,
        },
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: digitsOnly,
        type: "text",
        text: {
          preview_url: false,
          body: message.body,
        },
      };
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.whatsappAccessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `WhatsApp Cloud API send failed (${response.status}): ${errorText}`,
      );
    }

    const data = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
    };
    const messageId = data.messages?.[0]?.id || `waba_${Date.now()}`;
    return {
      messageId,
      rawResponse: data,
    };
  }
}
