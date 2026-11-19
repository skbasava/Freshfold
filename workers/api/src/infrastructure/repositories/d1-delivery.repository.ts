import { and, asc, desc, eq, gte, lt, lte, or } from "drizzle-orm";
import type {
  DeliveryRecord,
  DeliveryRepository,
  DeliveryStatusHistoryRecord,
  DeliveryWithHistory,
} from "../../domain/repositories/delivery.repository";
import type { DeliveryStatus, DeliveryType } from "../../shared/constants";
import { NotFoundError } from "../../shared/errors";
import {
  buildCursorPage,
  type CursorPage,
  type CursorPayload,
} from "../../shared/pagination";
import { mapSqliteError, type ApiDatabase } from "../db/client";
import { deliveries, deliveryStatusHistory } from "../db/schema";

function mapDeliveryRow(row: typeof deliveries.$inferSelect): DeliveryRecord {
  return {
    ...row,
    deliveryType: row.deliveryType as DeliveryType,
    status: row.status as DeliveryStatus,
  };
}

export class D1DeliveryRepository implements DeliveryRepository {
  constructor(
    private readonly db: ApiDatabase,
    private readonly d1: D1Database,
  ) {}

  async create(input: {
    delivery: Omit<DeliveryRecord, "id">;
    changedByUserId?: number | null;
  }): Promise<DeliveryWithHistory> {
    try {
      const [created] = await this.db
        .insert(deliveries)
        .values(input.delivery)
        .returning();

      const [hist] = await this.db
        .insert(deliveryStatusHistory)
        .values({
          deliveryId: created!.id,
          fromStatus: null,
          toStatus: created!.status,
          reason: "Delivery leg scheduled",
          changedByUserId: input.changedByUserId ?? null,
          createdAt: created!.createdAt,
        })
        .returning();

      return {
        delivery: mapDeliveryRow(created!),
        history: [
          {
            ...hist!,
            fromStatus: null,
            toStatus: hist!.toStatus as DeliveryStatus,
          },
        ],
      };
    } catch (error) {
      mapSqliteError(error);
    }
  }

  async findById(id: number): Promise<DeliveryRecord | null> {
    const [row] = await this.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, id))
      .limit(1);
    return row ? mapDeliveryRow(row) : null;
  }

  async findWithHistory(id: number): Promise<DeliveryWithHistory | null> {
    const delivery = await this.findById(id);
    if (!delivery) return null;

    const historyRows = await this.db
      .select()
      .from(deliveryStatusHistory)
      .where(eq(deliveryStatusHistory.deliveryId, id))
      .orderBy(asc(deliveryStatusHistory.createdAt), asc(deliveryStatusHistory.id));

    return {
      delivery,
      history: historyRows.map(
        (h): DeliveryStatusHistoryRecord => ({
          ...h,
          fromStatus: (h.fromStatus as DeliveryStatus | null) ?? null,
          toStatus: h.toStatus as DeliveryStatus,
        }),
      ),
    };
  }

  async list(params: {
    orderId?: number;
    customerId?: number;
    status?: DeliveryStatus;
    scheduledFrom?: string;
    scheduledTo?: string;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<DeliveryRecord>> {
    const conditions = [];
    if (params.orderId !== undefined) {
      conditions.push(eq(deliveries.orderId, params.orderId));
    }
    if (params.customerId !== undefined) {
      conditions.push(eq(deliveries.customerId, params.customerId));
    }
    if (params.status !== undefined) {
      conditions.push(eq(deliveries.status, params.status));
    }
    if (params.scheduledFrom) {
      conditions.push(gte(deliveries.scheduledAt, params.scheduledFrom));
    }
    if (params.scheduledTo) {
      conditions.push(lte(deliveries.scheduledAt, params.scheduledTo));
    }
    if (params.cursor) {
      conditions.push(
        or(
          lt(deliveries.createdAt, params.cursor.createdAt),
          and(
            eq(deliveries.createdAt, params.cursor.createdAt),
            lt(deliveries.id, params.cursor.id),
          ),
        ),
      );
    }

    const rows = await this.db
      .select()
      .from(deliveries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(deliveries.createdAt), desc(deliveries.id))
      .limit(params.limit + 1);

    return buildCursorPage(rows.map(mapDeliveryRow), params.limit);
  }

  async transitionStatus(input: {
    deliveryId: number;
    fromStatus: DeliveryStatus;
    toStatus: DeliveryStatus;
    reason?: string | null;
    completedAt?: string | null;
    proofR2Key?: string | null;
    changedByUserId?: number | null;
    nowIso: string;
  }): Promise<DeliveryRecord> {
    try {
      await this.d1.batch([
        this.d1
          .prepare(
            `UPDATE deliveries
             SET status = ?, completed_at = ?, proof_r2_key = ?, updated_at = ?
             WHERE id = ? AND status = ?`,
          )
          .bind(
            input.toStatus,
            input.completedAt ?? null,
            input.proofR2Key ?? null,
            input.nowIso,
            input.deliveryId,
            input.fromStatus,
          ),
        this.d1
          .prepare(
            `INSERT INTO delivery_status_history (
              delivery_id, from_status, to_status, reason, changed_by_user_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            input.deliveryId,
            input.fromStatus,
            input.toStatus,
            input.reason ?? null,
            input.changedByUserId ?? null,
            input.nowIso,
          ),
      ]);

      const updated = await this.findById(input.deliveryId);
      if (!updated) {
        throw new NotFoundError(`Delivery #${input.deliveryId} not found`);
      }
      return updated;
    } catch (error) {
      mapSqliteError(error);
    }
  }
}
