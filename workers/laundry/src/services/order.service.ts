import type {
  OrderDetail,
  OrderListResponse,
} from "../../../../packages/contracts/src/orders";
import type { OrderEvent } from "../../../../packages/contracts/src/changes";
import type {
  ApplyChangeInput,
  ApplyChangeResult,
} from "../../../../packages/contracts/src/mutations";
import type { OrderStateSnapshot } from "../../../../packages/contracts/src/crn";
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
import { OrderStateService } from "./order-state.service";
import { decodeCursor } from "../pagination";

export { applyChange, ApplyChangeError } from "./apply-change";

export class OrderService implements IOrderService {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly db: D1Database,
    private readonly logger?: Logger,
    private readonly kv?: KVNamespace,
  ) {}

  async getOrder(hubId: string, id: string, tenantId?: string): Promise<OrderDetail | null> {
    this.logger?.debug("order_service_get_requested", { hubId, orderId: id, tenantId });

    const order = await this.orderRepo.getById(hubId, id, tenantId);
    if (!order) {
      this.logger?.debug("order_service_get_not_found", { hubId, orderId: id, tenantId });
      return null;
    }

    // State management is maintained in Cloudflare KV
    const crnKey = order.crnId ?? order.id;
    const kvState = await OrderStateService.getState(this.kv, crnKey);
    if (kvState) {
      order.status = kvState.currentState;
      order.previousState = kvState.previousState;
      order.stateSnapshot = kvState as unknown as Record<string, unknown>;
    }

    this.logger?.info("order_service_get_success", {
      hubId,
      orderId: id,
      version: order.version,
      status: order.status,
      tenantId,
    });
    return order;
  }

  async getOrderState(hubId: string, id: string, tenantId?: string): Promise<OrderStateSnapshot | null> {
    if (id.startsWith("crn:")) {
      const state = await OrderStateService.getState(this.kv, id);
      if (state) return state;
    }

    const order = await this.orderRepo.getById(hubId, id, tenantId);
    if (!order) return null;

    const crnKey = order.crnId ?? order.id;
    return OrderStateService.getState(this.kv, crnKey);
  }

  async listOrders(
    hubId: string,
    query: { limit: number; cursor: string | null },
    tenantId?: string,
  ): Promise<OrderListResponse> {
    this.logger?.debug("order_service_list_requested", {
      hubId,
      limit: query.limit,
      cursor: query.cursor,
      tenantId,
    });

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const result = await this.orderRepo.list(
      hubId,
      {
        limit: query.limit,
        cursor,
      },
      tenantId,
    );

    // Enrich with KV state
    const enrichedItems = await Promise.all(
      result.items.map(async (item) => {
        const crnKey = item.crnId ?? item.id;
        const kvState = await OrderStateService.getState(this.kv, crnKey);
        if (kvState) {
          return {
            ...item,
            status: kvState.currentState,
            previousState: kvState.previousState,
          };
        }
        return item;
      }),
    );

    this.logger?.info("order_service_list_success", {
      hubId,
      count: enrichedItems.length,
      hasNext: Boolean(result.nextCursor),
      tenantId,
    });

    return { items: enrichedItems, nextCursor: result.nextCursor };
  }

  async listEvents(
    hubId: string,
    orderId: string,
    limit = 50,
    tenantId?: string,
  ): Promise<OrderEvent[]> {
    this.logger?.debug("order_service_list_events_requested", {
      hubId,
      orderId,
      limit,
      tenantId,
    });

    const events = await this.orderRepo.listEvents(hubId, orderId, limit, tenantId);

    this.logger?.info("order_service_list_events_success", {
      hubId,
      orderId,
      count: events.length,
      tenantId,
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

      const crnKey = result.order.crnId ?? result.order.id;
      if (input.intent === "createOrder") {
        await OrderStateService.initializeOrderState(this.kv, {
          crnId: crnKey,
          orderId: result.order.id,
          tenantId: actor.tenantId ?? "tenant-default",
          hubId: actor.hubId,
          actor: {
            actorType: actor.actorType,
            actorId: actor.actorId,
          },
          now: options.now,
          mutationId: input.mutationId,
        });
      } else {
        await OrderStateService.transitionOrderState(this.kv, {
          crnId: crnKey,
          orderId: result.order.id,
          tenantId: actor.tenantId ?? "tenant-default",
          hubId: actor.hubId,
          intent: input.intent,
          newVersion: result.order.version,
          actor: {
            actorType: actor.actorType,
            actorId: actor.actorId,
          },
          holdComment: "comments" in input.payload ? (input.payload.comments as string) : null,
          reason: "reason" in input.payload ? (input.payload.reason as string) : null,
          now: options.now,
          mutationId: input.mutationId,
        });
      }

      // Synchronize returned order status from KV
      const liveState = await OrderStateService.getState(this.kv, crnKey);
      if (liveState) {
        result.order.status = liveState.currentState;
        result.order.previousState = liveState.previousState;
        result.order.stateSnapshot = liveState as unknown as Record<string, unknown>;
      }

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

        // Record broken flow diagnostic in KV
        let crnKey = input.orderId;
        let existingState: OrderStateSnapshot | null = null;
        try {
          const existing = await this.orderRepo.getById(actor.hubId, input.orderId, actor.tenantId);
          if (existing?.crnId) {
            crnKey = existing.crnId;
          }
        } catch {
          // ignore
        }

        try {
          existingState = await OrderStateService.getState(this.kv, crnKey);
        } catch {
          // ignore
        }

        await OrderStateService.saveState(this.kv, {
          crnId: crnKey.startsWith("crn:") ? crnKey : `crn:1:0:${input.orderId}`,
          orderId: input.orderId,
          tenantId: actor.tenantId ?? "tenant-default",
          hubId: actor.hubId,
          previousState: existingState?.previousState ?? null,
          currentState: existingState?.currentState ?? "confirmed",
          intent: input.intent,
          version: existingState?.version ?? 0,
          changedAt: options.now ?? Date.now(),
          actor: {
            actorType: actor.actorType,
            actorId: actor.actorId,
          },
          diagnostic: {
            status: "broken",
            reason: `Order mutation failed: ${error.code}`,
            brokenStep: input.intent,
            lastMutationId: input.mutationId,
            errorCode: error.code,
            errorMessage: error.message,
          },
        }).catch(() => null);

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
