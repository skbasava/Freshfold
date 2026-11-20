import type { OutboundNotificationMessage } from "../../../domain/entities/notification.entity";
import type { TenantPushConfig } from "../../../domain/entities/tenant-config.entity";
import type {
  IPushProviderAdapter,
  ProviderAdapterResult,
} from "../../../domain/interfaces/provider-adapters.interface";

export class WebPushAdapter implements IPushProviderAdapter {
  readonly providerName = "web_push";

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async sendPush(
    config: TenantPushConfig,
    message: OutboundNotificationMessage,
  ): Promise<ProviderAdapterResult> {
    // The recipient for web push is an endpoint URL or serialized subscription
    let endpointUrl = message.recipient;
    let authHeader = "";

    try {
      if (message.recipient.startsWith("{")) {
        const sub = JSON.parse(message.recipient) as { endpoint: string };
        endpointUrl = sub.endpoint;
      }
    } catch {
      // Use raw recipient as endpoint
    }

    if (!endpointUrl.startsWith("http")) {
      throw new Error(`Invalid Push notification recipient endpoint: ${endpointUrl}`);
    }

    const payload = JSON.stringify({
      title: message.subject || "FreshFold Notification",
      body: message.body,
      data: message.metadata || {},
    });

    const headers: Record<string, string> = {
      "content-type": "application/json",
      TTL: "86400",
    };

    if (config.vapidPublicKey && config.vapidPrivateKey) {
      authHeader = `vapid t=${config.vapidPublicKey}, k=${config.vapidPrivateKey}`;
      headers["authorization"] = authHeader;
    }

    const response = await this.fetchFn(endpointUrl, {
      method: "POST",
      headers,
      body: payload,
    });

    if (!response.ok && response.status !== 201 && response.status !== 200) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Push notification dispatch failed (${response.status}): ${errorText}`);
    }

    return {
      messageId: `push_${Date.now()}`,
    };
  }
}
