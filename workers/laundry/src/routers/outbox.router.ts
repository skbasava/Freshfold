import { Hono } from "hono";
import { requireActor, type LaundryEnv } from "../authz";
import {
  outboxFailedHandler,
  outboxHealthHandler,
  outboxReplayHandler,
  outboxSweepHandler,
} from "../handlers/outbox.handler";

export const outboxRouter = new Hono<LaundryEnv>();

outboxRouter.post(
  "/sweep",
  requireActor,
  outboxSweepHandler,
);

outboxRouter.get(
  "/health",
  requireActor,
  outboxHealthHandler,
);

outboxRouter.get(
  "/failed",
  requireActor,
  outboxFailedHandler,
);

outboxRouter.post(
  "/replay",
  requireActor,
  outboxReplayHandler,
);

