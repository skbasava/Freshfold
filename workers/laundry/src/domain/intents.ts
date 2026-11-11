import type { ApplyChangeIntent } from "../../../../packages/contracts/src/mutations";
import type { Permission } from "../../../../packages/domain/src/permissions";

export function permissionForIntent(intent: ApplyChangeIntent): Permission {
  switch (intent) {
    case "createOrder":
      return "create_order";
    case "reschedule":
      return "reschedule_order";
    case "markProcessing":
    case "placeOnHold":
    case "releaseHold":
    case "markOutForDelivery":
    case "markDelivered":
      return "update_order_status";
    case "cancel":
      return "cancel_order";
  }
}
