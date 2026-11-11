import type {
  NotificationProviderAdapter,
  OutboundNotification,
} from "../../packages/notification-client/src/index";

export interface FakeNotificationMessage {
  to: string;
  channel: "whatsapp" | "sms";
  body: string;
  idempotencyKey?: string;
}

export interface FakeNotificationResult {
  id: string;
}

export class FakeNotificationProvider
  implements NotificationProviderAdapter
{
  readonly sent: Array<FakeNotificationMessage & { id: string }> = [];
  failNext = false;
  nextError: Error | null = null;

  constructor(
    readonly channel: "whatsapp" | "sms" = "whatsapp",
    readonly supportsIdempotency = false,
  ) {}

  async send(
    message: OutboundNotification | FakeNotificationMessage,
  ): Promise<FakeNotificationResult> {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }

    if (this.failNext) {
      this.failNext = false;
      throw new Error("provider unavailable");
    }

    const id = `msg-${this.sent.length + 1}`;
    this.sent.push({ ...message, id });
    return { id };
  }
}
