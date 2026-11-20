import type { OutboundNotificationMessage } from "../../../domain/entities/notification.entity";
import type { TenantSmsConfig } from "../../../domain/entities/tenant-config.entity";
import type {
  ISmsProviderAdapter,
  ProviderAdapterResult,
} from "../../../domain/interfaces/provider-adapters.interface";

export class GenericHttpSmsAdapter implements ISmsProviderAdapter {
  readonly providerName = "generic_http";

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async sendSms(
    config: TenantSmsConfig,
    message: OutboundNotificationMessage,
  ): Promise<ProviderAdapterResult> {
    if (!config.endpointUrl) {
      throw new Error("SMS provider endpointUrl is not configured for tenant");
    }

    const digitsOnly = message.recipient.replace(/[^0-9]/g, "");
    const toParamName = config.toParamName || "to";
    const msgParamName = config.messageParamName || "message";
    const method = (config.httpMethod || "POST").toUpperCase();

    const headers: Record<string, string> = {
      accept: "application/json",
      ...(config.customHeaders || {}),
    };

    if (config.apiKey) {
      const headerName = config.authHeaderName || "authorization";
      const prefix = config.authHeaderPrefix !== undefined ? config.authHeaderPrefix : "Bearer ";
      headers[headerName.toLowerCase()] = `${prefix}${config.apiKey}`.trim();
    }

    let url = config.endpointUrl;
    let requestInit: RequestInit;

    if (method === "GET") {
      const parsedUrl = new URL(url);
      parsedUrl.searchParams.set(toParamName, digitsOnly);
      parsedUrl.searchParams.set(msgParamName, message.body);
      if (config.senderId) {
        parsedUrl.searchParams.set("sender", config.senderId);
      }
      if (config.extraQueryParams) {
        for (const [k, v] of Object.entries(config.extraQueryParams)) {
          parsedUrl.searchParams.set(k, v);
        }
      }
      requestInit = {
        method: "GET",
        headers,
      };
      url = parsedUrl.toString();
    } else {
      headers["content-type"] = "application/json";
      const bodyPayload: Record<string, unknown> = {
        [toParamName]: digitsOnly,
        [msgParamName]: message.body,
        ...(config.senderId ? { sender_id: config.senderId, sender: config.senderId } : {}),
        ...(config.extraQueryParams || {}),
      };
      requestInit = {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
      };
    }

    const response = await this.fetchFn(url, requestInit);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`SMS gateway send failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const messageId =
      (data.message_id as string) ||
      (data.messageId as string) ||
      (data.id as string) ||
      `sms_${Date.now()}`;

    return {
      messageId,
      rawResponse: data,
    };
  }
}
