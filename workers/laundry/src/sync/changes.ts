import type {
  ChangeOperation,
  ChangeRecord,
} from "../../../../packages/contracts/src/changes";
import { getOrder } from "../orders/read";

type ChangeRow = {
  id: number;
  hub_id: string;
  order_id: string;
  version: number;
  op: ChangeOperation;
  changed_at: number;
};

export type ChangePage = {
  changes: ChangeRecord[];
  nextCursor: number;
  hasMore: boolean;
};

export async function listChanges(
  db: D1Database,
  hubId: string,
  options: { since: number; limit: number },
): Promise<ChangePage> {
  const result = await db
    .prepare(
      `SELECT id, hub_id, order_id, version, op, changed_at
       FROM changes
       WHERE hub_id = ? AND id > ?
       ORDER BY id ASC
       LIMIT ?`,
    )
    .bind(hubId, options.since, options.limit + 1)
    .all<ChangeRow>();

  const hasMore = result.results.length > options.limit;
  const page = result.results.slice(0, options.limit);
  const changes: ChangeRecord[] = [];

  for (const row of page) {
    if (row.op === "upsert") {
      const order = await getOrder(db, hubId, row.order_id);
      if (!order) {
        throw new Error(`change ${row.id} references missing order`);
      }
      changes.push({
        sequence: row.id,
        hubId: row.hub_id,
        orderId: row.order_id,
        version: row.version,
        operation: "upsert",
        changedAt: row.changed_at,
        order,
      });
    } else {
      changes.push({
        sequence: row.id,
        hubId: row.hub_id,
        orderId: row.order_id,
        version: row.version,
        operation: "delete",
        changedAt: row.changed_at,
        order: null,
      });
    }
  }

  const last = page[page.length - 1];
  return {
    changes,
    nextCursor: last?.id ?? options.since,
    hasMore,
  };
}
