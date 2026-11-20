import { Hono } from "hono";
import type { NotificationHandler } from "../handlers/notification.handler";

export function createNotificationRouter(handler: NotificationHandler): Hono {
  const router = new Hono();

  router.post("/send", handler.send);
  router.post("/enqueue", handler.enqueue);
  router.post("/batch", handler.sendBatch);
  router.get("/queue/stats", handler.getQueueStats);

  return router;
}
