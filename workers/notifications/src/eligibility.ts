import type { NotificationOrderState } from "../../../packages/contracts/src/notifications";
import type { NotificationSuppressionReason } from "../../../packages/contracts/src/notifications";

export type NotificationEligibilityDecision =
  | { action: "send" }
  | { action: "retry"; reason: "canonical_version_behind" }
  | {
      action: "suppress";
      reason: NotificationSuppressionReason;
    };

export function evaluateNotificationEligibility(input: {
  order: NotificationOrderState;
  targetVersion: number;
}): NotificationEligibilityDecision {
  if (input.order.version > input.targetVersion) {
    return { action: "suppress", reason: "superseded" };
  }

  if (input.order.version < input.targetVersion) {
    return { action: "retry", reason: "canonical_version_behind" };
  }

  if (
    input.order.deliveryAt !== null &&
    input.order.lastNotifiedDeliveryAt === input.order.deliveryAt
  ) {
    return { action: "suppress", reason: "duplicate_delivery" };
  }

  return { action: "send" };
}
