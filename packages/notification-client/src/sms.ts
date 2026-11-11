import { postProviderJson, readProviderMessageId } from "./http";
import type {
  FetchLike,
  NotificationProviderAdapter,
  OutboundNotification,
  ProviderSendResult,
} from "./types";

export type SmsProviderOptions = {
  endpoint: string;
  apiKey: string;
  senderId: string;
  idempotencyHeader?: string;
  fetcher?: FetchLike;
  timeoutMs?: number;
};

export class SmsProviderAdapter implements NotificationProviderAdapter {
  readonly channel = "sms" as const;
  readonly supportsIdempotency = true;

  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly idempotencyHeader: string;
  private readonly fetcher: FetchLike;
  private readonly timeoutMs?: number;

  constructor(options: SmsProviderOptions) {
    this.endpoint = options.endpoint;
    this.apiKey = options.apiKey;
    this.senderId = options.senderId;
    this.idempotencyHeader =
      options.idempotencyHeader ?? "idempotency-key";
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs;
  }

  async send(
    message: OutboundNotification,
  ): Promise<ProviderSendResult> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
    };
    if (message.idempotencyKey) {
      headers[this.idempotencyHeader] = message.idempotencyKey;
    }

    const response = await postProviderJson({
      fetcher: this.fetcher,
      url: this.endpoint,
      headers,
      body: {
        to: message.to,
        sender: this.senderId,
        body: message.body,
      },
      timeoutMs: this.timeoutMs,
    });

    const id = await readProviderMessageId(response, (body) => {
      const record = body as { id?: unknown; messageId?: unknown };
      const candidate =
        typeof record.id === "string" ? record.id : record.messageId;
      return typeof candidate === "string" ? candidate : null;
    });

    return { id };
  }
}
