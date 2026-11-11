import { validateSlotTiming } from "../domain/business-time";

export const CAPACITY_STATUS_SQL =
  "('confirmed','processing','hold','out_for_delivery')";

export { validateSlotTiming };

export type CapacitySlot = {
  id: string;
  hub_id: string;
  starts_at: number;
  ends_at: number;
  capacity: number;
};

export async function findActiveSlot(
  db: D1Database,
  hubId: string,
  slotId: string,
): Promise<CapacitySlot | null> {
  return db
    .prepare(
      `SELECT id, hub_id, starts_at, ends_at, capacity
       FROM delivery_slots
       WHERE id = ? AND hub_id = ? AND active = 1`,
    )
    .bind(slotId, hubId)
    .first<CapacitySlot>();
}

export async function isSlotFull(
  db: D1Database,
  hubId: string,
  slotId: string,
  excludeOrderId: string | null,
): Promise<boolean> {
  const exclusion = excludeOrderId ? "AND id <> ?" : "";
  const bindings = excludeOrderId
    ? [hubId, slotId, excludeOrderId]
    : [hubId, slotId];

  const count = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM orders
       WHERE hub_id = ? AND delivery_slot_id = ?
         AND status IN ${CAPACITY_STATUS_SQL} ${exclusion}`,
    )
    .bind(...bindings)
    .first<{ n: number }>();

  const slot = await findActiveSlot(db, hubId, slotId);
  return Boolean(slot && (count?.n ?? 0) >= slot.capacity);
}
