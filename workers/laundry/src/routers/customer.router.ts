import { Hono } from "hono";
import { requireActor, requirePermission, type LaundryEnv } from "../authz";
import {
  getCustomerHandler,
  listCustomersHandler,
} from "../handlers/customer.handler";

export const customerRouter = new Hono<LaundryEnv>();

customerRouter.get(
  "/",
  requireActor,
  requirePermission("view_orders"),
  listCustomersHandler,
);

customerRouter.get(
  "/:id",
  requireActor,
  requirePermission("view_orders"),
  getCustomerHandler,
);

