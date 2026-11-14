import { Hono } from "hono";
import { requireActor, type LaundryEnv } from "../authz";
import {
  createHubHandler,
  deleteHubHandler,
  getHubHandler,
  listHubsHandler,
  updateHubHandler,
} from "../handlers/hub.handler";

export const hubRouter = new Hono<LaundryEnv>();

hubRouter.post("/", requireActor, createHubHandler);
hubRouter.get("/", requireActor, listHubsHandler);
hubRouter.get("/:id", requireActor, getHubHandler);
hubRouter.patch("/:id", requireActor, updateHubHandler);
hubRouter.delete("/:id", requireActor, deleteHubHandler);

