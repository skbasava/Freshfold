import type { Context } from "hono";
import { deliverySlotListResponseSchema } from "../../../../packages/contracts/src/orders";
import type { LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";
import { DeliverySlotRepository } from "../repositories/delivery-slot.repository";
import { DeliverySlotService } from "../services/delivery-slot.service";

export async function listDeliverySlotsHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const date = c.req.query("date");
  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.debug("handler_list_delivery_slots", { hubId: actor.hubId, date });

  const repo = new DeliverySlotRepository(db, getLaundryLogger(c.env, c.get("requestId"), "repository"));
  const service = new DeliverySlotService(repo, getLaundryLogger(c.env, c.get("requestId"), "service"));

  const result = await service.listSlots(actor.hubId, date);
  return c.json(deliverySlotListResponseSchema.parse(result));
}

