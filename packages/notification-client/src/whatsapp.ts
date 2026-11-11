import { postProviderJson, readProviderMessageId } from "./http";
import type {
  FetchLike,
  NotificationProviderAdapter,
  OutboundNotification,
  ProviderSendResult,
} from "./types";

export type WhatsAppProviderOptions = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion?: string;
  baseUrl?: string;
  fetcher?: FetchLike;
  timeoutMs?: number;
};

export class WhatsAppProviderAdapter implements NotificationProviderAdapter {
  readonly channel = "whatsapp" as const;
  // WhatsApp Cloud API does not provide a verified idempotency guarantee.
  readonly supportsIdempotency = false;

  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly timeoutMs?: number;

  constructor(options: WhatsAppProviderOptions) {
    this.accessToken = options.accessToken;
    this.phoneNumberId = options.phoneNumberId;
    this.baseUrl =
      options.baseUrl ??
      `https://graph.facebook.com/${options.apiVersion ?? "v22.0"}`;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs;
  }

  async send(
    message: OutboundNotification,
  ): Promise<ProviderSendResult> {
    const response = await postProviderJson({
      fetcher: this.fetcher,
      url: `${this.baseUrl.replace(/\/$/, "")}/${this.phoneNumberId}/messages`,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
      },
      body: {
        messaging_product: "whatsapp",
        to: message.to,
        type: "text",
        text: { body: message.body },
      },
      timeoutMs: this.timeoutMs,
    });

    const id = await readProviderMessageId(response, (body) => {
      const messages = (body as { messages?: Array<{ id?: unknown }> })
        .messages;
      const candidate = messages?.[0]?.id;
      return typeof candidate === "string" ? candidate : null;
    });

    return { id };
  }
}
