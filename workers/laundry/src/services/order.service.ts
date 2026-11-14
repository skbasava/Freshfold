import type {
  OrderDetail,
  OrderListResponse,
} from "../../../../packages/contracts/src/orders";
import type { OrderEvent } from "../../../../packages/contracts/src/changes";
import type {
  ApplyChangeInput,
  ApplyChangeResult,
} from "../../../../packages/contracts/src/mutations";
import type { InternalContext } from "../../../../packages/contracts/src/auth";
import {
  METRICS,
  OBSERVABILITY_EVENTS,
  type Logger,
} from "../../../../packages/shared/src/observability";
import type {
  IOrderRepository,
  IOrderService,
} from "../interfaces/order.interface";
import { applyChange, ApplyChangeError } from "./apply-change";
import { decodeCursor } from "../pagination";

export { applyChange, ApplyChangeError } from "./apply-change";

export class OrderService implements IOrderService {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly db: D1Database,
    private readonly logger?: Logger,
  ) {}

  async getOrder(hubId: string, id: string): Promise<OrderDetail | null> {
    this.logger?.debug("order_service_get_requested", { hubId, orderId: id });

    const order = await this.orderRepo.getById(hubId, id);
    if (!order) {
      this.logger?.debug("order_service_get_not_found", { hubId, orderId: id });
      return null;
    }

    this.logger?.info("order_service_get_success", {
      hubId,
      orderId: id,
      version: order.version,
      status: order.status,
    });
    return order;
  }

  async listOrders(
    hubId: string,
    query: { limit: number; cursor: string | null },
  ): Promise<OrderListResponse> {
    this.logger?.debug("order_service_list_requested", {
      hubId,
      limit: query.limit,
      cursor: query.cursor,
    });

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const result = await this.orderRepo.list(hubId, {
      limit: query.limit,
      cursor,
    });

    this.logger?.info("order_service_list_success", {
      hubId,
      count: result.items.length,
      hasNext: Boolean(result.nextCursor),
    });

    return result;
  }

  async listEvents(
    hubId: string,
    orderId: string,
    limit = 50,
  ): Promise<OrderEvent[]> {
    this.logger?.debug("order_service_list_events_requested", {
      hubId,
      orderId,
      limit,
    });

    const events = await this.orderRepo.listEvents(hubId, orderId, limit);

    this.logger?.info("order_service_list_events_success", {
      hubId,
      orderId,
      count: events.length,
    });

    return events;
  }

  async applyChange(
    actor: InternalContext,
    input: ApplyChangeInput,
    options: { now?: number } = {},
  ): Promise<ApplyChangeResult> {
    this.logger?.info(OBSERVABILITY_EVENTS.applyChangeStarted, {
      orderId: input.orderId,
      intent: input.intent,
      mutationId: input.mutationId,
      baseVersion: "baseVersion" in input ? input.baseVersion : undefined,
      actorType: actor.actorType,
      actorId: actor.actorId,
      hubId: actor.hubId,
    });

    try {
      const result = await applyChange(this.db, actor, input, options);

      if (result.replayed) {
        this.logger?.info(OBSERVABILITY_EVENTS.applyChangeReplayed, {
          orderId: result.order.id,
          version: result.order.version,
          mutationId: input.mutationId,
        });
      } else {
        this.logger?.info(OBSERVABILITY_EVENTS.applyChangeAccepted, {
          orderId: result.order.id,
          version: result.order.version,
          status: result.order.status,
          mutationId: input.mutationId,
          customerCreated: result.customerCreated,
        });
      }

      return result;
    } catch (error) {
      if (error instanceof ApplyChangeError) {
        this.logger?.warn(OBSERVABILITY_EVENTS.applyChangeRejected, {
          orderId: input.orderId,
          code: error.code,
          status: error.status,
          intent: input.intent,
          mutationId: input.mutationId,
        });

        if (
          error.code === "VERSION_CONFLICT" ||
          error.code === "MUTATION_PAYLOAD_MISMATCH"
        ) {
          this.logger?.warn(OBSERVABILITY_EVENTS.mutationConflict, {
            orderId: input.orderId,
            code: error.code,
            actorType: actor.actorType,
          });
          this.logger?.metric(METRICS.mutationConflicts, 1, {
            reason: error.code,
          });
        }

        if (error.code === "SLOT_FULL") {
          this.logger?.warn(OBSERVABILITY_EVENTS.capacityRejection, {
            orderId: input.orderId,
            code: error.code,
            actorType: actor.actorType,
          });
          this.logger?.metric(METRICS.capacityRejections, 1, {
            reason: error.code,
          });
        }
      }
      throw error;
    }
  }
}
