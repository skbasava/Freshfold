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
import type { Cursor } from "../pagination";

export interface IOrderRepository {
  getById(hubId: string, id: string): Promise<OrderDetail | null>;
  list(
    hubId: string,
    options: { limit: number; cursor: Cursor | null },
  ): Promise<OrderListResponse>;
  listEvents(hubId: string, orderId: string, limit: number): Promise<OrderEvent[]>;
}

export interface IOrderService {
  getOrder(hubId: string, id: string): Promise<OrderDetail | null>;
  listOrders(
    hubId: string,
    query: { limit: number; cursor: string | null },
  ): Promise<OrderListResponse>;
  listEvents(hubId: string, orderId: string, limit?: number): Promise<OrderEvent[]>;
  applyChange(
    actor: InternalContext,
    input: ApplyChangeInput,
    options?: { now?: number },
  ): Promise<ApplyChangeResult>;
}
