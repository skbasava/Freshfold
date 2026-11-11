import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NotificationProviderAdapter,
  OutboundNotification,
} from "../../packages/notification-client/src/index";
import { ProviderSendError } from "../../packages/notification-client/src/index";
import type { OutboxQueueMessage } from "../../packages/contracts/src/queue-messages";
import laundry from "../../workers/laundry/src/index";
import {
  processNotificationMessage,
  type ConsumerMessage,
  type NotificationConsumerEnv,
} from "../../workers/notifications/src/consumer";
import {
  clearLaundryData,
  seedLaundryReadFixtures,
  TEST_HUB,
} from "../helpers/laundry-db";

type TestEnv = {
  LAUNDRY_DB: D1Database;
  TEST_LAUNDRY_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as TestEnv;
const db = testEnv.LAUNDRY_DB;
const SERVICE_TOKEN = "test-service-token-32-characters-long";
const NOW = Date.parse("2026-11-11T04:00:00.000Z");
const PHONE = "+919000000001";
const DELIVERY_AT = 5000;

type ProviderBehavior =
  | "success"
  | "timeout"
  | "rate_limited"
  | "transient"
  | "terminal";

class ScriptedProvider implements NotificationProviderAdapter {
  readonly sent: OutboundNotification[] = [];

  constructor(
    readonly channel: "whatsapp" | "sms" = "whatsapp",
    readonly supportsIdempotency = false,
    private behavior: ProviderBehavior = "success",
  ) {}

  async send(message: OutboundNotification): Promise<{ id: string }> {
    this.sent.push(message);

    switch (this.behavior) {
      case "timeout":
        throw new ProviderSendError("timeout", "provider_timeout");
      case "rate_limited":
        throw new ProviderSendError("rate_limited", "provider_rate_limited", {
          retryAfterMs: 15_000,
        });
      case "transient":
        throw new ProviderSendError("transient", "provider_server_error");
      case "terminal":
        throw new ProviderSendError("terminal", "provider_rejected");
      default:
        return { id: `provider-message-${this.sent.length}` };
    }
  }
}

function fakeMessage(body: unknown): ConsumerMessage & {
  readonly ackCount: number;
  readonly retryCount: number;
  readonly retryOptions: Array<{ delaySeconds?: number } | undefined>;
} {
  let ackCount = 0;
  let retryCount = 0;
  const retryOptions: Array<{ delaySeconds?: number } | undefined> = [];

  return {
    body,
    get ackCount() {
      return ackCount;
    },
    get retryCount() {
      return retryCount;
    },
    get retryOptions() {
      return retryOptions;
    },
    ack() {
      ackCount += 1;
    },
    retry(options) {
      retryCount += 1;
      retryOptions.push(options);
    },
  };
}

function message(
  overrides: Partial<OutboxQueueMessage> = {},
): OutboxQueueMessage {
  return {
    outboxId: "outbox-1",
    hubId: TEST_HUB,
    orderId: "order-1",
    destination: "notification",
    operation: "SEND_STATUS",
    targetVersion: 1,
    mutationId: "mutation-1",
    ...overrides,
  };
}

function laundryBinding(
  intercept?: (request: Request) => Response | null,
): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const intercepted = intercept?.(request);
      if (intercepted) {
        return intercepted;
      }

      const ctx = createExecutionContext();
      const response = await laundry.fetch(
        request,
        {
          LAUNDRY_DB: db,
          INTERNAL_CONTEXT_SECRET: "test-internal-context-secret-32-bytes",
          SERVICE_TOKEN,
        } as never,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return response;
    },
  } as Fetcher;
}

function consumerEnv(
  provider: NotificationProviderAdapter,
  options: {
    delaySeconds?: number;
    laundry?: Fetcher;
    now?: number;
  } = {},
): NotificationConsumerEnv {
  return {
    LAUNDRY: options.laundry ?? laundryBinding(),
    SERVICE_TOKEN,
    NOTIFICATION_CHANNEL: "whatsapp",
    NOTIFICATION_DELAY_SECONDS: String(options.delaySeconds ?? 0),
    notificationProvider: provider,
    now: () => options.now ?? NOW,
  };
}

async function seedNotificationOutbox(
  input: {
    id?: string;
    targetVersion?: number;
    createdAt?: number;
    status?: "pending" | "dispatching" | "done" | "failed";
  } = {},
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO outbox
        (id, hub_id, order_id, destination, operation, target_version,
         mutation_id, status, attempts, next_attempt_at, created_at)
       VALUES (?, ?, 'order-1', 'notification', 'SEND_STATUS', ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      input.id ?? "outbox-1",
      TEST_HUB,
      input.targetVersion ?? 1,
      "mutation-1",
      input.status ?? "pending",
      input.createdAt ?? NOW,
      input.createdAt ?? NOW,
    )
    .run();
}

async function readNotification(): Promise<{
  state: string;
  provider_message_id: string | null;
  last_error: string | null;
  attempts: number;
} | null> {
  return db
    .prepare(
      `SELECT state, provider_message_id, last_error, attempts
       FROM notifications WHERE order_id = 'order-1' AND hub_id = ?`,
    )
    .bind(TEST_HUB)
    .first();
}

async function readLastNotifiedDeliveryAt(): Promise<number | null> {
  const row = await db
    .prepare(
      "SELECT last_notified_delivery_at FROM orders WHERE id = 'order-1' AND hub_id = ?",
    )
    .bind(TEST_HUB)
    .first<{ last_notified_delivery_at: number | null }>();
  return row?.last_notified_delivery_at ?? null;
}

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_LAUNDRY_MIGRATIONS);
});

beforeEach(async () => {
  await clearLaundryData(db);
  await seedLaundryReadFixtures(db);
  await seedNotificationOutbox();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notification consumer eligibility", () => {
  it("reloads authoritative state and sends one notification", async () => {
    const provider = new ScriptedProvider();
    const queueMessage = fakeMessage(message());

    await expect(
      processNotificationMessage(queueMessage, consumerEnv(provider)),
    ).resolves.toBe("acked");

    expect(queueMessage.ackCount).toBe(1);
    expect(queueMessage.retryCount).toBe(0);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({
      to: PHONE,
      channel: "whatsapp",
    });
    expect(provider.sent[0]?.body).toContain("order-1");

    expect(await readNotification()).toMatchObject({
      state: "sent",
      provider_message_id: "provider-message-1",
      last_error: null,
      attempts: 1,
    });
    expect(await readLastNotifiedDeliveryAt()).toBe(DELIVERY_AT);

    const outbox = await db
      .prepare("SELECT status FROM outbox WHERE id = 'outbox-1'")
      .first<{ status: string }>();
    expect(outbox?.status).toBe("done");
  });

  it("suppresses a duplicate delivery update using last_notified_delivery_at", async () => {
    await db
      .prepare(
        "UPDATE orders SET last_notified_delivery_at = ? WHERE id = 'order-1' AND hub_id = ?",
      )
      .bind(DELIVERY_AT, TEST_HUB)
      .run();
    const provider = new ScriptedProvider();
    const queueMessage = fakeMessage(message());

    await processNotificationMessage(queueMessage, consumerEnv(provider));

    expect(queueMessage.ackCount).toBe(1);
    expect(provider.sent).toEqual([]);
    expect((await readNotification())?.state).toBe("suppressed");
  });

  it("suppresses a delayed message superseded by a reschedule", async () => {
    await db
      .prepare(
        "UPDATE orders SET version = 3, delivery_at = 9000 WHERE id = 'order-1' AND hub_id = ?",
      )
      .bind(TEST_HUB)
      .run();
    const provider = new ScriptedProvider();
    const queueMessage = fakeMessage(message({ targetVersion: 1 }));

    await processNotificationMessage(queueMessage, consumerEnv(provider));

    expect(queueMessage.ackCount).toBe(1);
    expect(provider.sent).toEqual([]);
    expect((await readNotification())?.state).toBe("suppressed");
  });

  it("retries when canonical state is behind the target version", async () => {
    const provider = new ScriptedProvider();
    const queueMessage = fakeMessage(message({ targetVersion: 2 }));

    await processNotificationMessage(queueMessage, consumerEnv(provider));

    expect(queueMessage.ackCount).toBe(0);
    expect(queueMessage.retryCount).toBe(1);
    expect(provider.sent).toEqual([]);
    expect(await readNotification()).toBeNull();
  });

  it("acknowledges when the order no longer exists", async () => {
    await db
      .prepare("DELETE FROM orders WHERE id = 'order-1' AND hub_id = ?")
      .bind(TEST_HUB)
      .run();
    const provider = new ScriptedProvider();
    const queueMessage = fakeMessage(message());

    await processNotificationMessage(queueMessage, consumerEnv(provider));

    expect(queueMessage.ackCount).toBe(1);
    expect(queueMessage.retryCount).toBe(0);
    expect(provider.sent).toEqual([]);
  });
});

describe("notification delayed handling and claims", () => {
  it("defers a message until its intended send time", async () => {
    const provider = new ScriptedProvider();
    const queueMessage = fakeMessage(message());

    await processNotificationMessage(
      queueMessage,
      consumerEnv(provider, { delaySeconds: 300 }),
    );

    expect(queueMessage.ackCount).toBe(0);
    expect(queueMessage.retryCount).toBe(1);
    expect(queueMessage.retryOptions[0]).toEqual({ delaySeconds: 300 });
    expect(provider.sent).toEqual([]);
    expect(await readNotification()).toBeNull();
  });

  it("prevents duplicate sends when the same queue message is delivered twice", async () => {
    const provider = new ScriptedProvider();
    const first = fakeMessage(message());
    const second = fakeMessage(message());

    await processNotificationMessage(first, consumerEnv(provider));
    await processNotificationMessage(second, consumerEnv(provider));

    expect(first.ackCount).toBe(1);
    expect(second.ackCount).toBe(1);
    expect(provider.sent).toHaveLength(1);
  });

  it("claims the ledger once under concurrent duplicate delivery", async () => {
    const provider = new ScriptedProvider();

    await Promise.all([
      processNotificationMessage(fakeMessage(message()), consumerEnv(provider)),
      processNotificationMessage(fakeMessage(message()), consumerEnv(provider)),
    ]);

    expect(provider.sent).toHaveLength(1);
  });
});

describe("notification provider failures", () => {
  it("records an ambiguous timeout without claiming exactly-once delivery", async () => {
    const provider = new ScriptedProvider("whatsapp", false, "timeout");
    const queueMessage = fakeMessage(message());

    await processNotificationMessage(queueMessage, consumerEnv(provider));

    expect(queueMessage.ackCount).toBe(1);
    expect(queueMessage.retryCount).toBe(0);
    expect(await readNotification()).toMatchObject({
      state: "failed",
      provider_message_id: null,
      last_error: "provider_timeout_uncertain",
    });
  });

  it("retries a timeout only when the provider supports idempotency keys", async () => {
    const provider = new ScriptedProvider("sms", true, "timeout");
    const queueMessage = fakeMessage(message());

    await processNotificationMessage(
      queueMessage,
      consumerEnv(provider),
    );

    expect(queueMessage.retryCount).toBe(1);
    expect(await readNotification()).toMatchObject({
      state: "pending",
      last_error: "provider_timeout",
    });
    expect(provider.sent[0]?.idempotencyKey).toBe(
      "notification:hub-1:order-1:1",
    );
  });

  it("retries rate-limited and 5xx failures with the provider delay", async () => {
    for (const behavior of ["rate_limited", "transient"] as const) {
      await clearLaundryData(db);
      await seedLaundryReadFixtures(db);
      await seedNotificationOutbox();
      const provider = new ScriptedProvider("whatsapp", false, behavior);
      const queueMessage = fakeMessage(message());

      await processNotificationMessage(queueMessage, consumerEnv(provider));

      expect(queueMessage.retryCount).toBe(1);
      expect((await readNotification())?.last_error).toBe(
        behavior === "rate_limited"
          ? "provider_rate_limited"
          : "provider_server_error",
      );
      if (behavior === "rate_limited") {
        expect(queueMessage.retryOptions[0]).toEqual({ delaySeconds: 15 });
      }
    }
  });

  it("does not retry a terminal provider rejection", async () => {
    const provider = new ScriptedProvider("whatsapp", false, "terminal");
    const queueMessage = fakeMessage(message());

    await processNotificationMessage(queueMessage, consumerEnv(provider));

    expect(queueMessage.ackCount).toBe(1);
    expect(queueMessage.retryCount).toBe(0);
    expect(await readNotification()).toMatchObject({
      state: "failed",
      last_error: "provider_rejected",
    });
  });

  it("handles a crash between provider acceptance and outcome recording honestly", async () => {
    const provider = new ScriptedProvider("whatsapp", false, "success");
    const queueMessage = fakeMessage(message());

    await processNotificationMessage(
      queueMessage,
      consumerEnv(provider, {
        laundry: laundryBinding((request) =>
          request.url.endsWith("/internal/notifications/outcome")
            ? new Response("unavailable", { status: 503 })
            : null,
        ),
      }),
    );

    expect(provider.sent).toHaveLength(1);
    expect(queueMessage.ackCount).toBe(1);
    expect(queueMessage.retryCount).toBe(0);
    expect(await readNotification()).toMatchObject({
      state: "sending",
      provider_message_id: null,
    });
  });

  it("never logs customer phone numbers or message contents", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = new ScriptedProvider("whatsapp", false, "terminal");

    await processNotificationMessage(
      fakeMessage(message()),
      consumerEnv(provider),
    );

    const flushed = JSON.stringify(log.mock.calls);
    expect(flushed).not.toContain(PHONE);
    expect(flushed).not.toContain("Your order");
  });
});
