import type { OrderEvent } from "../../../../packages/contracts/src/changes";

type OrderEventRow = {
  id: string;
  hub_id: string;
  order_id: string;
  mutation_id: string;
  event_type: string;
  source: "app" | "calendar" | "system";
  actor_type: "user" | "service" | "system";
  actor_id: string | null;
  previous_version: number;
  new_version: number;
  at: number;
  detail_json: string;
};

export async function listOrderEvents(
  db: D1Database,
  hubId: string,
  orderId: string,
  limit: number,
): Promise<OrderEvent[]> {
  const result = await db
    .prepare(
      `SELECT
        id, hub_id, order_id, mutation_id, event_type, source, actor_type,
        actor_id, previous_version, new_version, at, detail_json
       FROM order_events
       WHERE hub_id = ? AND order_id = ?
       ORDER BY at DESC, id DESC
       LIMIT ?`,
    )
    .bind(hubId, orderId, limit)
    .all<OrderEventRow>();

  return result.results.map((row) => ({
    id: row.id,
    hubId: row.hub_id,
    orderId: row.order_id,
    mutationId: row.mutation_id,
    eventType: row.event_type,
    source: row.source,
    actorType: row.actor_type,
    actorId: row.actor_id,
    previousVersion: row.previous_version,
    newVersion: row.new_version,
    at: row.at,
    detail: JSON.parse(row.detail_json) as unknown,
  }));
}
