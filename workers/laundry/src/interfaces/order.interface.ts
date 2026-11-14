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
import type { Cursor } from "../pagination";

export interface IOrderRepository {
  getById(hubId: string, id: string, tenantId?: string): Promise<OrderDetail | null>;
  list(
    hubId: string,
    options: { limit: number; cursor: Cursor | null },
    tenantId?: string,
  ): Promise<OrderListResponse>;
  listEvents(hubId: string, orderId: string, limit: number, tenantId?: string): Promise<OrderEvent[]>;
}

export interface IOrderService {
  getOrder(hubId: string, id: string, tenantId?: string): Promise<OrderDetail | null>;
  getOrderState(hubId: string, id: string, tenantId?: string): Promise<OrderStateSnapshot | null>;
  listOrders(
    hubId: string,
    query: { limit: number; cursor: string | null },
    tenantId?: string,
  ): Promise<OrderListResponse>;
  listEvents(hubId: string, orderId: string, limit?: number, tenantId?: string): Promise<OrderEvent[]>;
  applyChange(
    actor: InternalContext,
    input: ApplyChangeInput,
    options?: { now?: number },
  ): Promise<ApplyChangeResult>;
}
