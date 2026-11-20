import type { OutboundNotificationMessage } from "../../../domain/entities/notification.entity";
import type { TenantEmailConfig } from "../../../domain/entities/tenant-config.entity";
import type {
  IEmailProviderAdapter,
  ProviderAdapterResult,
} from "../../../domain/interfaces/provider-adapters.interface";

export class ResendEmailAdapter implements IEmailProviderAdapter {
  readonly providerName = "resend";

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async sendEmail(
    config: TenantEmailConfig,
    message: OutboundNotificationMessage,
  ): Promise<ProviderAdapterResult> {
    if (!config.apiKey) {
      throw new Error("Resend API key is not configured for tenant");
    }

    const fromAddress = config.senderName
      ? `${config.senderName} <${config.senderEmail || "notifications@freshfold.in"}>`
      : config.senderEmail || "notifications@freshfold.in";

    const payload: Record<string, unknown> = {
      from: fromAddress,
      to: [message.recipient],
      subject: message.subject || "FreshFold Order Update",
      html: message.body.startsWith("<")
        ? message.body
        : `<p>${message.body.replace(/\n/g, "<br/>")}</p>`,
      text: message.body,
    };

    if (message.attachments && message.attachments.length > 0) {
      payload.attachments = message.attachments.map((att) => ({
        filename: att.filename,
        content: att.contentBase64,
      }));
    }

    const response = await this.fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Resend send failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
    };
    return {
      messageId: data.id || `resend_${Date.now()}`,
      rawResponse: data,
    };
  }
}
