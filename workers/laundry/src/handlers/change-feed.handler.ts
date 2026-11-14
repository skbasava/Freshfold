import type { Context } from "hono";
import {
  changeFeedQuerySchema,
  changeFeedResponseSchema,
} from "../../../../packages/contracts/src/changes";
import type { LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";
import { ChangeFeedRepository } from "../repositories/change-feed.repository";
import { ChangeFeedService } from "../services/change-feed.service";

export async function listChangesHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const query = changeFeedQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const actor = c.get("actor");
  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.debug("handler_list_changes", { hubId: actor.hubId, query: query.data });

  const repo = new ChangeFeedRepository(
    db,
    getLaundryLogger(c.env, c.get("requestId"), "repository"),
  );
  const service = new ChangeFeedService(
    repo,
    getLaundryLogger(c.env, c.get("requestId"), "service"),
  );

  const result = await service.getChanges(actor.hubId, query.data);
  return c.json(changeFeedResponseSchema.parse(result));
}

