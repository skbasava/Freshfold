import type { OutboxQueueMessage } from "../../../packages/contracts/src/queue-messages";

export type SchedulerQueueEnv = {
  CALENDAR_QUEUE?: Queue<OutboxQueueMessage>;
  NOTIFY_QUEUE?: Queue<OutboxQueueMessage>;
};

export async function enqueueOutboxMessage(
  env: SchedulerQueueEnv,
  message: OutboxQueueMessage,
): Promise<void> {
  const queue =
    message.destination === "calendar"
      ? env.CALENDAR_QUEUE
      : env.NOTIFY_QUEUE;

  if (!queue) {
    throw new Error("queue_binding_missing");
  }

  await queue.send(message);
}
