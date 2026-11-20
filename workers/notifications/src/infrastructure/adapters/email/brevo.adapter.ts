import type { OutboundNotificationMessage } from "../../../domain/entities/notification.entity";
import type { TenantEmailConfig } from "../../../domain/entities/tenant-config.entity";
import type {
  IEmailProviderAdapter,
  ProviderAdapterResult,
} from "../../../domain/interfaces/provider-adapters.interface";

export class BrevoEmailAdapter implements IEmailProviderAdapter {
  readonly providerName = "brevo";

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async sendEmail(
    config: TenantEmailConfig,
    message: OutboundNotificationMessage,
  ): Promise<ProviderAdapterResult> {
    if (!config.apiKey) {
      throw new Error("Brevo API key is not configured for tenant");
    }

    const payload: Record<string, unknown> = {
      sender: {
        email: config.senderEmail || "no-reply@freshfold.in",
        name: config.senderName || "FreshFold Laundry",
      },
      to: [{ email: message.recipient }],
      subject: message.subject || "FreshFold Order Update",
      htmlContent: message.body.startsWith("<")
        ? message.body
        : `<p>${message.body.replace(/\n/g, "<br/>")}</p>`,
      textContent: message.body,
    };

    if (message.attachments && message.attachments.length > 0) {
      payload.attachment = message.attachments.map((att) => ({
        name: att.filename,
        content: att.contentBase64,
      }));
    }

    const response = await this.fetchFn("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Brevo send failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json().catch(() => ({}))) as {
      messageId?: string;
    };
    return {
      messageId: data.messageId || `brevo_${Date.now()}`,
      rawResponse: data,
    };
  }
}
