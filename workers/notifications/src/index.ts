import { createNotificationsApp } from "./presentation/app";
import {
  NotificationQueueDurableObject,
  NotificationQueueManager,
} from "./infrastructure/durable-objects/notification-queue.do";

const app = createNotificationsApp();

export default {
  fetch: app.fetch,

  // Cloudflare Queue Consumer for background asynchronous notifications
  async queue(batch: MessageBatch<any>, env: any, ctx: ExecutionContext): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const body = msg.body;
        if (body && typeof body === "object" && body.channel && body.recipient) {
          const req = new Request("http://internal/api/v1/notifications/send", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-tenant-id": String(body.tenantId || 1),
            },
            body: JSON.stringify(body),
          });
          const res = await app.fetch(req, env, ctx);
          if (res.ok) {
            msg.ack();
          } else {
            msg.retry();
          }
        } else {
          msg.ack(); // Drop malformed messages
        }
      } catch (err) {
        console.error("Queue message processing failed:", err);
        msg.retry();
      }
    }
  },
};

export {
  NotificationQueueDurableObject,
  NotificationQueueManager,
  createNotificationsApp,
};
export * from "./domain/entities/notification.entity";
export * from "./domain/entities/tenant-config.entity";
export * from "./domain/interfaces/notification-service.interface";
export * from "./domain/interfaces/tenant-config.repository.interface";
export * from "./domain/interfaces/notification-ledger.repository.interface";
export * from "./domain/interfaces/provider-adapters.interface";
export * from "./infrastructure/repositories/d1-tenant-config.repository";
export * from "./infrastructure/repositories/d1-notification-ledger.repository";
