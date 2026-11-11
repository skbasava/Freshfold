import { describe, expect, it } from "vitest";
import {
  createNotificationProvider,
  ProviderSendError,
  SmsProviderAdapter,
  WhatsAppProviderAdapter,
  type NotificationProviderAdapter,
  type OutboundNotification,
} from "../../packages/notification-client/src/index";

const MESSAGE: OutboundNotification = {
  to: "+919000000001",
  channel: "whatsapp",
  body: "Your order is ready.",
  idempotencyKey: "notification:hub-1:order-1:2",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fakeFetch(
  handler: (request: Request) => Response | Promise<Response>,
): {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  requests: Request[];
} {
  const requests: Request[] = [];
  return {
    requests,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return handler(request);
    },
  };
}

describe("WhatsApp provider adapter", () => {
  it("sends a text message and returns the provider message id", async () => {
    const transport = fakeFetch(() =>
      jsonResponse({ messages: [{ id: "wamid.123" }] }),
    );
    const adapter = new WhatsAppProviderAdapter({
      accessToken: "whatsapp-access-token-value",
      phoneNumberId: "phone-number-id",
      fetcher: transport.fetch,
    });

    const result = await adapter.send(MESSAGE);

    expect(result).toEqual({ id: "wamid.123" });
    expect(adapter.channel).toBe("whatsapp");
    expect(adapter.supportsIdempotency).toBe(false);
    expect(transport.requests).toHaveLength(1);

    const request = transport.requests[0]!;
    expect(request.url).toContain("/phone-number-id/messages");
    expect(request.headers.get("authorization")).toBe(
      "Bearer whatsapp-access-token-value",
    );
    const body = (await request.json()) as {
      messaging_product: string;
      to: string;
      text: { body: string };
    };
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe(MESSAGE.to);
    expect(body.text.body).toBe(MESSAGE.body);
  });

  it("classifies a provider timeout as uncertain without leaking the token", async () => {
    const adapter = new WhatsAppProviderAdapter({
      accessToken: "super-secret-token-value",
      phoneNumberId: "phone-number-id",
      fetcher: async () => {
        throw Object.assign(new Error("request included super-secret-token-value"), {
          name: "AbortError",
        });
      },
    });

    const error = await adapter.send(MESSAGE).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderSendError);
    expect((error as ProviderSendError).kind).toBe("timeout");
    expect((error as ProviderSendError).message).not.toContain(
      "super-secret-token-value",
    );
  });

  it("classifies 429 responses as rate limited with a retry delay", async () => {
    const adapter = new WhatsAppProviderAdapter({
      accessToken: "token",
      phoneNumberId: "phone-number-id",
      fetcher: async () =>
        new Response("slow down", {
          status: 429,
          headers: { "retry-after": "30" },
        }),
    });

    const error = await adapter.send(MESSAGE).catch((caught: unknown) => caught);

    expect((error as ProviderSendError).kind).toBe("rate_limited");
    expect((error as ProviderSendError).retryAfterMs).toBe(30_000);
  });

  it("classifies 5xx responses as transient and 4xx responses as terminal", async () => {
    const transient = new WhatsAppProviderAdapter({
      accessToken: "token",
      phoneNumberId: "phone-number-id",
      fetcher: async () => jsonResponse({ error: "busy" }, 503),
    });
    const terminal = new WhatsAppProviderAdapter({
      accessToken: "token",
      phoneNumberId: "phone-number-id",
      fetcher: async () => jsonResponse({ error: "bad request" }, 400),
    });

    await expect(transient.send(MESSAGE)).rejects.toMatchObject({
      kind: "transient",
    });
    await expect(terminal.send(MESSAGE)).rejects.toMatchObject({
      kind: "terminal",
    });
  });
});

describe("SMS provider adapter", () => {
  it("sends the idempotency key and stores the provider message id", async () => {
    const transport = fakeFetch(() => jsonResponse({ id: "sms-123" }));
    const adapter = new SmsProviderAdapter({
      endpoint: "https://sms.example.test/messages",
      apiKey: "sms-api-key-value",
      senderId: "FRESHFOLD",
      fetcher: transport.fetch,
    });

    const result = await adapter.send({ ...MESSAGE, channel: "sms" });

    expect(result).toEqual({ id: "sms-123" });
    expect(adapter.channel).toBe("sms");
    expect(adapter.supportsIdempotency).toBe(true);

    const request = transport.requests[0]!;
    expect(request.headers.get("authorization")).toBe("Bearer sms-api-key-value");
    expect(request.headers.get("idempotency-key")).toBe(
      MESSAGE.idempotencyKey,
    );

    const body = (await request.json()) as {
      to: string;
      sender: string;
      body: string;
    };
    expect(body).toEqual({
      to: MESSAGE.to,
      sender: "FRESHFOLD",
      body: MESSAGE.body,
    });
  });
});

describe("notification provider factory", () => {
  it("selects the configured channel", () => {
    const whatsapp = createNotificationProvider({
      channel: "whatsapp",
      accessToken: "token",
      phoneNumberId: "phone-number-id",
    });
    const sms = createNotificationProvider({
      channel: "sms",
      endpoint: "https://sms.example.test/messages",
      apiKey: "key",
      senderId: "FRESHFOLD",
    });

    expect((whatsapp as NotificationProviderAdapter).channel).toBe("whatsapp");
    expect((sms as NotificationProviderAdapter).channel).toBe("sms");
  });
});
