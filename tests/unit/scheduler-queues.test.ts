import { describe, expect, it } from "vitest";
import type { OutboxQueueMessage } from "../../packages/contracts/src/queue-messages";
import { enqueueOutboxMessage } from "../../workers/scheduler/src/queues";

const calendarMessage: OutboxQueueMessage = {
  outboxId: "outbox-1",
  hubId: "hub-1",
  orderId: "order-1",
  destination: "calendar",
  operation: "UPSERT_EVENT",
  targetVersion: 1,
  mutationId: "mutation-1",
};

function fakeQueue() {
  const sent: OutboxQueueMessage[] = [];
  return {
    sent,
    send: async (message: OutboxQueueMessage): Promise<void> => {
      sent.push(message);
    },
  };
}

describe("scheduler queue helper", () => {
  it("routes calendar messages to the calendar queue", async () => {
    const calendar = fakeQueue();
    const notifications = fakeQueue();

    await enqueueOutboxMessage(
      {
        CALENDAR_QUEUE: calendar as unknown as Queue<OutboxQueueMessage>,
        NOTIFY_QUEUE: notifications as unknown as Queue<OutboxQueueMessage>,
      },
      calendarMessage,
    );

    expect(calendar.sent).toEqual([calendarMessage]);
    expect(notifications.sent).toEqual([]);
  });

  it("routes notification messages to the notification queue", async () => {
    const calendar = fakeQueue();
    const notifications = fakeQueue();

    await enqueueOutboxMessage(
      {
        CALENDAR_QUEUE: calendar as unknown as Queue<OutboxQueueMessage>,
        NOTIFY_QUEUE: notifications as unknown as Queue<OutboxQueueMessage>,
      },
      { ...calendarMessage, destination: "notification" },
    );

    expect(calendar.sent).toEqual([]);
    expect(notifications.sent).toHaveLength(1);
  });

  it("rejects when the destination queue is missing", async () => {
    await expect(
      enqueueOutboxMessage({}, calendarMessage),
    ).rejects.toThrow("queue_binding_missing");
  });
});
