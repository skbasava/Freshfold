import { describe, expect, it } from "vitest";
import type { OutboxQueueMessage } from "../../packages/contracts/src/queue-messages";
import {
  handleCalendarQueue,
  processCalendarMessage,
  type CalendarEventApi,
} from "../../workers/calendar/src/consumer";
import { deterministicEventId } from "../../workers/calendar/src/projection";
import { processNotificationMessage } from "../../workers/notifications/src/consumer";
import { FakeGoogleCalendar } from "../fakes/google-calendar";

const baseMessage: OutboxQueueMessage = {
  outboxId: "outbox-1",
  hubId: "hub-1",
  orderId: "order-1",
  destination: "calendar",
  operation: "UPSERT_EVENT",
  targetVersion: 2,
  mutationId: "mutation-1",
};

function fakeMessage(body: unknown) {
  let ackCount = 0;
  let retryCount = 0;
  return {
    body,
    get ackCount() {
      return ackCount;
    },
    get retryCount() {
      return retryCount;
    },
    ack() {
      ackCount += 1;
    },
    retry() {
      retryCount += 1;
    },
  };
}

function fakeLaundry(
  handler: (request: Request) => Response | Promise<Response>,
) {
  const requests: Request[] = [];
  const binding = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      return handler(request);
    },
  };
  return { requests, binding: binding as unknown as Fetcher };
}

function orderDetail(version: number, status = "processing") {
  const now = 1_700_000_000_000;
  return {
    id: "order-1",
    hubId: "hub-1",
    customerId: "cust-1",
    customerName: "Alice",
    customerPhone: "+919000000001",
    status,
    serviceType: "wash_fold",
    deliverySlotId: "slot-1",
    deliveryAt: Date.parse("2026-11-11T11:30:00.000Z"),
    version,
    createdAt: now,
    updatedAt: now,
    cancelledAt: null,
    holdComment: null,
    customer: {
      id: "cust-1",
      hubId: "hub-1",
      name: "Alice",
      phone: "+919000000001",
      notes: null,
      createdAt: now,
      updatedAt: now,
    },
    items: [],
  };
}

function calendarBackend(initialVersion: number, status = "processing") {
  let projectedVersion = 0;
  return fakeLaundry((request) => {
    if (request.url.endsWith("/projection")) {
      projectedVersion = initialVersion;
      return Response.json({ updated: true, calendarSync: null });
    }
    if (request.url.endsWith("/outbox/complete")) {
      return Response.json({ completed: true });
    }
    return Response.json({
      order: orderDetail(initialVersion, status),
      calendarSync:
        projectedVersion > 0
          ? {
              orderId: "order-1",
              hubId: "hub-1",
              calendarId: "calendar-1",
              eventId: deterministicEventId("order-1"),
              etag: "etag-1",
              syncedVersion: projectedVersion,
              syncStatus: "synced",
              lastError: null,
              lastProjectedAt: 1,
              updatedAt: 1,
            }
          : null,
    });
  });
}

function env(
  laundry: Fetcher,
  calendar: FakeGoogleCalendar = new FakeGoogleCalendar(),
) {
  return {
    LAUNDRY: laundry,
    SERVICE_TOKEN: "test-service-token-32-characters-long",
    GOOGLE_CALENDAR_ID: "calendar-1",
    googleCalendar: calendar as unknown as CalendarEventApi,
    now: () => Date.parse("2026-11-11T04:00:00.000Z"),
  };
}

describe("calendar queue consumer", () => {
  it("reloads the canonical order and acknowledges a current message", async () => {
    const laundry = calendarBackend(2);
    const message = fakeMessage({ ...baseMessage });

    await expect(
      processCalendarMessage(message, env(laundry.binding)),
    ).resolves.toBe("acked");

    expect(message.ackCount).toBe(1);
    expect(message.retryCount).toBe(0);
    expect(laundry.requests.length).toBeGreaterThanOrEqual(1);

    const request = laundry.requests[0];
    expect(request.url).toBe(
      "https://laundry.internal/internal/calendar/orders/order-1",
    );
    expect(request.headers.get("x-service-name")).toBe("calendar");
    expect(request.headers.get("x-service-hub-id")).toBe("hub-1");
    expect(request.headers.get("x-service-tenant-id")).toBe("system");
    expect(request.headers.get("x-service-token")).toBe(
      "test-service-token-32-characters-long",
    );
  });

  it("is idempotent for a duplicate message", async () => {
    const laundry = calendarBackend(2);
    const calendar = new FakeGoogleCalendar();
    const message = fakeMessage({ ...baseMessage });

    await processCalendarMessage(message, env(laundry.binding, calendar));
    await processCalendarMessage(message, env(laundry.binding, calendar));

    expect(message.ackCount).toBe(2);
    expect(message.retryCount).toBe(0);
    expect(await calendar.list()).toHaveLength(1);
  });

  it("acknowledges a stale out-of-order message", async () => {
    const laundry = calendarBackend(3);
    const message = fakeMessage({ ...baseMessage });

    await processCalendarMessage(message, env(laundry.binding));

    expect(message.ackCount).toBe(1);
    expect(message.retryCount).toBe(0);
  });

  it("retries when canonical state is behind the target version", async () => {
    const laundry = calendarBackend(1);
    const message = fakeMessage({ ...baseMessage });

    await processCalendarMessage(message, env(laundry.binding));

    expect(message.ackCount).toBe(0);
    expect(message.retryCount).toBe(1);
  });

  it("retries when the authoritative reload fails", async () => {
    const laundry = fakeLaundry(() => new Response("unavailable", { status: 503 }));
    const message = fakeMessage({ ...baseMessage });

    await processCalendarMessage(message, env(laundry.binding));

    expect(message.retryCount).toBe(1);
  });

  it("acknowledges when the order no longer exists", async () => {
    const laundry = fakeLaundry(() => new Response("missing", { status: 404 }));
    const message = fakeMessage({ ...baseMessage });

    await processCalendarMessage(message, env(laundry.binding));

    expect(message.ackCount).toBe(1);
    expect(message.retryCount).toBe(0);
  });

  it("retries an invalid message without reloading", async () => {
    const laundry = fakeLaundry(() => Response.json({}));
    const message = fakeMessage({ ...baseMessage, targetVersion: 0 });

    await processCalendarMessage(message, env(laundry.binding));

    expect(message.retryCount).toBe(1);
    expect(laundry.requests).toHaveLength(0);
  });

  it("retries when the service token is missing", async () => {
    const laundry = fakeLaundry(() => Response.json({}));
    const message = fakeMessage({ ...baseMessage });

    await processCalendarMessage(message, { LAUNDRY: laundry.binding });

    expect(message.retryCount).toBe(1);
    expect(laundry.requests).toHaveLength(0);
  });

  it("explicitly acknowledges and retries each batch message", async () => {
    const laundry = calendarBackend(2);
    const valid = fakeMessage({ ...baseMessage });
    const invalid = fakeMessage({ ...baseMessage, destination: "notification" });

    await handleCalendarQueue(
      { messages: [valid, invalid] } as unknown as MessageBatch<unknown>,
      env(laundry.binding),
    );

    expect(valid.ackCount).toBe(1);
    expect(valid.retryCount).toBe(0);
    expect(invalid.ackCount).toBe(0);
    expect(invalid.retryCount).toBe(1);
  });
});

function notificationBackend(version: number, duplicateDelivery = false) {
  return fakeLaundry((request) => {
    if (request.url.endsWith("/internal/notifications/suppress")) {
      return Response.json({ suppressed: true, notification: null });
    }

    return Response.json({
      id: "order-1",
      hubId: "hub-1",
      version,
      status: "processing",
      serviceType: "wash_fold",
      deliveryAt: 1000,
      lastNotifiedDeliveryAt: duplicateDelivery ? 1000 : null,
      customerName: "Alice",
      customerPhone: "+919000000001",
    });
  });
}

describe("notification queue consumer", () => {
  it("reloads canonical state and acknowledges a duplicate delivery", async () => {
    const laundry = notificationBackend(2, true);
    const message = fakeMessage({ ...baseMessage, destination: "notification" });

    await processNotificationMessage(message, env(laundry.binding));

    expect(message.ackCount).toBe(1);
    expect(message.retryCount).toBe(0);
    expect(laundry.requests[0].headers.get("x-service-name")).toBe(
      "notifications",
    );
  });

  it("acknowledges a stale message", async () => {
    const laundry = notificationBackend(4);
    const message = fakeMessage({ ...baseMessage, destination: "notification" });

    await processNotificationMessage(message, env(laundry.binding));

    expect(message.ackCount).toBe(1);
  });

  it("retries a transient reload failure", async () => {
    const laundry = fakeLaundry(() => new Response("unavailable", { status: 500 }));
    const message = fakeMessage({ ...baseMessage, destination: "notification" });

    await processNotificationMessage(message, env(laundry.binding));

    expect(message.retryCount).toBe(1);
  });
});
