import type { ApplyChangeIntent } from "../../../../packages/contracts/src/mutations";
import type { OrderStatus } from "../../../../packages/contracts/src/orders";

export type UpdateIntent = Exclude<ApplyChangeIntent, "createOrder">;

const RESCHEDULABLE: ReadonlySet<OrderStatus> = new Set([
  "confirmed",
  "processing",
  "hold",
]);

const CANCELLABLE: ReadonlySet<OrderStatus> = new Set([
  "confirmed",
  "processing",
  "hold",
]);

export function nextStatus(
  current: OrderStatus,
  intent: UpdateIntent,
): OrderStatus | null {
  switch (intent) {
    case "markProcessing":
      return current === "confirmed" ? "processing" : null;
    case "placeOnHold":
      return current === "confirmed" || current === "processing"
        ? "hold"
        : null;
    case "releaseHold":
      return current === "hold" ? "processing" : null;
    case "markOutForDelivery":
      return current === "processing" ? "out_for_delivery" : null;
    case "markDelivered":
      return current === "out_for_delivery" ? "delivered" : null;
    case "reschedule":
      return RESCHEDULABLE.has(current) ? current : null;
    case "cancel":
      return CANCELLABLE.has(current) ? "cancelled" : null;
  }
}
