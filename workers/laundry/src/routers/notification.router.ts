import { Hono } from "hono";
import { requireActor, type LaundryEnv } from "../authz";
import {
  claimNotificationHandler,
  getNotificationOrderStateHandler,
  recordNotificationOutcomeHandler,
  suppressNotificationHandler,
} from "../handlers/notification.handler";

export const notificationRouter = new Hono<LaundryEnv>();

notificationRouter.get(
  "/orders/:id",
  requireActor,
  getNotificationOrderStateHandler,
);

notificationRouter.post(
  "/claim",
  requireActor,
  claimNotificationHandler,
);

notificationRouter.post(
  "/suppress",
  requireActor,
  suppressNotificationHandler,
);

notificationRouter.post(
  "/outcome",
  requireActor,
  recordNotificationOutcomeHandler,
);

