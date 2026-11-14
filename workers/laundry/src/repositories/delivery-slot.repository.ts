import type { DeliverySlot } from "../../../../packages/contracts/src/orders";
import type { Logger } from "../../../../packages/shared/src/observability";
import type { IDeliverySlotRepository } from "../interfaces/delivery-slot.interface";

type DeliverySlotRow = {
  id: string;
  hub_id: string;
  slot_key: string;
  local_date: string;
  local_start: string;
  starts_at: number;
  ends_at: number;
  capacity: number;
  active: number;
  created_at: number;
};

export class DeliverySlotRepository implements IDeliverySlotRepository {
  constructor(
    private readonly db: D1Database,
    private readonly logger?: Logger,
  ) {}

  async listActive(hubId: string, date?: string): Promise<DeliverySlot[]> {
    const start = Date.now();
    this.logger?.debug("slot_repo_list_active_started", { hubId, date });

    let query =
      "SELECT id, hub_id, slot_key, local_date, local_start, starts_at, ends_at, capacity, active, created_at FROM delivery_slots WHERE hub_id = ? AND active = 1";
    const bindings: Array<string | number> = [hubId];

    if (date) {
      query += " AND local_date = ?";
      bindings.push(date);
    }

    query += " ORDER BY starts_at ASC";

    const rows = await this.db
      .prepare(query)
      .bind(...bindings)
      .all<DeliverySlotRow>();

    const items: DeliverySlot[] = (rows.results ?? []).map((row) => ({
      id: row.id,
      hubId: row.hub_id,
      slotKey: row.slot_key,
      localDate: row.local_date,
      localStart: row.local_start,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      capacity: row.capacity,
      active: row.active,
      createdAt: row.created_at,
    }));

    this.logger?.debug("slot_repo_list_active_completed", {
      hubId,
      date,
      count: items.length,
      durationMs: Date.now() - start,
    });

    return items;
  }
}

