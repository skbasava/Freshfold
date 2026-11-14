import { Hono } from "hono";
import { requireActor, requirePermission, type LaundryEnv } from "../authz";
import { listDeliverySlotsHandler } from "../handlers/delivery-slot.handler";

export const deliverySlotRouter = new Hono<LaundryEnv>();

deliverySlotRouter.get(
  "/",
  requireActor,
  requirePermission("view_orders"),
  listDeliverySlotsHandler,
);

