import type { DeliveryStatus } from "../../shared/constants";
import { InvariantViolationError } from "../../shared/errors";

const DELIVERY_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  scheduled: ["dispatched", "rescheduled", "cancelled"],
  dispatched: ["in_transit", "completed", "failed", "rescheduled"],
  in_transit: ["completed", "failed", "rescheduled"],
  failed: ["rescheduled", "cancelled"],
  rescheduled: ["scheduled", "dispatched", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionDeliveryStatus(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  if (from === to) return false;
  return DELIVERY_TRANSITIONS[from].includes(to);
}

export function assertDeliveryStatusTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
): void {
  if (!canTransitionDeliveryStatus(from, to)) {
    throw new InvariantViolationError(
      `Invalid delivery status transition from '${from}' to '${to}'`,
    );
  }
}
