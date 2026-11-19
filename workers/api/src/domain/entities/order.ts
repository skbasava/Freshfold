import type { OrderStatus } from "../../shared/constants";
import { InvariantViolationError } from "../../shared/errors";

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["pickup_scheduled", "received", "processing", "ready", "out_for_delivery", "hold", "cancelled"],
  pickup_scheduled: ["picked_up", "hold", "cancelled"],
  picked_up: ["received", "hold", "cancelled"],
  received: ["processing", "ready", "out_for_delivery", "hold", "cancelled"],
  processing: ["ready", "out_for_delivery", "delivered", "hold", "cancelled"],
  ready: ["out_for_delivery", "delivered", "processing", "hold", "cancelled"],
  out_for_delivery: ["delivered", "ready", "hold", "cancelled"],
  hold: [
    "confirmed",
    "pickup_scheduled",
    "picked_up",
    "received",
    "processing",
    "ready",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ],
  delivered: [],
  cancelled: [],
};

export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return false;
  return ORDER_TRANSITIONS[from].includes(to);
}

export function assertOrderStatusTransition(
  from: OrderStatus,
  to: OrderStatus,
): void {
  if (!canTransitionOrderStatus(from, to)) {
    throw new InvariantViolationError(
      `Invalid order status transition from '${from}' to '${to}'`,
    );
  }
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return status === "delivered" || status === "cancelled";
}
