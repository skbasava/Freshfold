import {
  formatCrn,
  packCrn,
  parseCrn,
  CRN_TENANT_MAX,
  CRN_HUB_MAX,
  CRN_ORDER_MAX,
  type CrnComponents,
} from "../../../../packages/contracts/src/crn";
import type { Logger } from "../../../../packages/shared/src/observability";

export interface GeneratedCrn {
  crnId: string;
  crnPacked: number;
  components: CrnComponents;
}

export class CrnService {
  constructor(
    private readonly db: D1Database,
    private readonly logger?: Logger,
  ) {}

  /**
   * Acquire the next CRN for a given tenant and hub atomically using D1.
   */
  async generateNextCrn(
    tenantId: string,
    hubId: string,
    now: number = Date.now(),
  ): Promise<GeneratedCrn> {
    // 1. Resolve tenant seq_id (0..511)
    let tenantRow = await this.db
      .prepare(`SELECT seq_id FROM tenants WHERE id = ?`)
      .bind(tenantId)
      .first<{ seq_id: number | null }>();

    let tenantSeq = tenantRow?.seq_id ?? 1;
    if (tenantSeq < 0 || tenantSeq > CRN_TENANT_MAX) {
      tenantSeq = 1;
    }

    // 2. Resolve hub seq_id (0..15)
    let hubRow = await this.db
      .prepare(`SELECT seq_id FROM hubs WHERE id = ?`)
      .bind(hubId)
      .first<{ seq_id: number | null }>();

    let hubSeq = hubRow?.seq_id ?? 0;
    if (hubSeq < 0 || hubSeq > CRN_HUB_MAX) {
      hubSeq = 0;
    }

    // 3. Atomically advance order sequence counter for (tenant_id, hub_id)
    let nextSeq = 1;
    try {
      const counterRow = await this.db
        .prepare(
          `INSERT INTO hub_order_counters (tenant_id, hub_id, next_order_seq, updated_at)
           VALUES (?, ?, 1, ?)
           ON CONFLICT (tenant_id, hub_id)
           DO UPDATE SET
             next_order_seq = CASE
               WHEN hub_order_counters.next_order_seq >= ? THEN 1
               ELSE hub_order_counters.next_order_seq + 1
             END,
             updated_at = excluded.updated_at
           RETURNING next_order_seq`,
        )
        .bind(tenantId, hubId, now, CRN_ORDER_MAX)
        .first<{ next_order_seq: number }>();

      if (counterRow && typeof counterRow.next_order_seq === "number") {
        nextSeq = counterRow.next_order_seq;
      }
    } catch {
      // Fallback for mock or older SQLite engines without RETURNING
      const existing = await this.db
        .prepare(`SELECT next_order_seq FROM hub_order_counters WHERE tenant_id = ? AND hub_id = ?`)
        .bind(tenantId, hubId)
        .first<{ next_order_seq: number }>();

      if (existing) {
        nextSeq = (existing.next_order_seq + 1) % (CRN_ORDER_MAX + 1) || 1;
        await this.db
          .prepare(`UPDATE hub_order_counters SET next_order_seq = ?, updated_at = ? WHERE tenant_id = ? AND hub_id = ?`)
          .bind(nextSeq, now, tenantId, hubId)
          .run();
      } else {
        await this.db
          .prepare(`INSERT INTO hub_order_counters (tenant_id, hub_id, next_order_seq, updated_at) VALUES (?, ?, 1, ?)`)
          .bind(tenantId, hubId, now)
          .run();
        nextSeq = 1;
      }
    }

    const components: CrnComponents = {
      tenantId: tenantSeq,
      hubId: hubSeq,
      orderId: nextSeq,
    };

    const crnId = formatCrn(components);
    const crnPacked = packCrn(components);

    this.logger?.debug("crn_generated", {
      tenantId,
      hubId,
      crnId,
      crnPacked,
      components,
    });

    return { crnId, crnPacked, components };
  }
}

