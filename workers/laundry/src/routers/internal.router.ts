import { Hono } from "hono";
import { requireActor, type LaundryEnv } from "../authz";
import {
  checkAuthzHandler,
  whoamiHandler,
} from "../handlers/internal-authz.handler";
import {
  applyChangeHandler,
  getInternalOrderHandler,
} from "../handlers/order.handler";

export const internalRouter = new Hono<LaundryEnv>();

internalRouter.get(
  "/whoami",
  requireActor,
  whoamiHandler,
);

internalRouter.get(
  "/authz/check",
  requireActor,
  checkAuthzHandler,
);

internalRouter.get(
  "/orders/:id",
  requireActor,
  getInternalOrderHandler,
);

internalRouter.post(
  "/apply-change",
  requireActor,
  applyChangeHandler,
);

