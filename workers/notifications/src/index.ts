import { Hono } from "hono";
import {
  handleNotificationQueue,
  type NotificationConsumerEnv,
} from "./consumer";

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok" as const, service: "notifications" }),
);

export default {
  fetch: (request: Request, env: unknown, ctx: ExecutionContext) =>
    app.fetch(request, env as never, ctx),
  queue: async (
    batch: MessageBatch<unknown>,
    env: NotificationConsumerEnv,
  ): Promise<void> => {
    await handleNotificationQueue(
      {
        messages: batch.messages.map((message) => ({
          body: message.body,
          ack: () => message.ack(),
          retry: (options) => message.retry(options),
        })),
      },
      env,
    );
  },
};
