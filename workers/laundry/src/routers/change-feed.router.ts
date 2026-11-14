import { Hono } from "hono";
import { requireActor, requirePermission, type LaundryEnv } from "../authz";
import { listChangesHandler } from "../handlers/change-feed.handler";

export const changeFeedRouter = new Hono<LaundryEnv>();

changeFeedRouter.get(
  "/",
  requireActor,
  requirePermission("view_orders"),
  listChangesHandler,
);

