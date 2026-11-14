import { Hono } from "hono";
import { requireActor, requirePermission, type LaundryEnv } from "../authz";
import {
  applyChangeHandler,
  getOrderHandler,
  listOrderEventsHandler,
  listOrdersHandler,
} from "../handlers/order.handler";

export const orderRouter = new Hono<LaundryEnv>();

orderRouter.get(
  "/",
  requireActor,
  requirePermission("view_orders"),
  listOrdersHandler,
);

orderRouter.get(
  "/:id/events",
  requireActor,
  requirePermission("view_orders"),
  listOrderEventsHandler,
);

orderRouter.get(
  "/:id",
  requireActor,
  requirePermission("view_orders"),
  getOrderHandler,
);

orderRouter.post(
  "/apply-change",
  requireActor,
  applyChangeHandler,
);