import { Hono } from "hono";
import { requireActor, requirePermission, type LaundryEnv } from "../authz";
import {
  applyChangeHandler,
  cancelOrderHandler,
  createOrderCrudHandler,
  getOrderHandler,
  getOrderStateHandler,
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

orderRouter.post(
  "/",
  requireActor,
  requirePermission("create_order"),
  createOrderCrudHandler,
);

orderRouter.get(
  "/:id/state",
  requireActor,
  requirePermission("view_orders"),
  getOrderStateHandler,
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

orderRouter.delete(
  "/:id",
  requireActor,
  requirePermission("cancel_order"),
  cancelOrderHandler,
);

orderRouter.post(
  "/:id/cancel",
  requireActor,
  requirePermission("cancel_order"),
  cancelOrderHandler,
);
