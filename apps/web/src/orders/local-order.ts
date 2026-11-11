import type { ApplyChangeInput } from "@laundry/contracts";
import type { OrderSummary } from "@laundry/contracts";
import type {
  LocalOrder,
  LocalOrderSyncState,
} from "../sync/types";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(timestamp: number): string {
  let value = BigInt(timestamp);
  let encoded = "";
  for (let index = 0; index < 10; index += 1) {
    encoded = CROCKFORD[Number(value & 31n)] + encoded;
    value >>= 5n;
  }
  return encoded;
}

function encodeRandom(bytes: Uint8Array): string {
  let encoded = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += CROCKFORD[(value >>> bits) & 31];
    }
  }
  return encoded;
}

export function createOrderId(
  now: number = Date.now(),
  randomBytes: Uint8Array = crypto.getRandomValues(new Uint8Array(10)),
): string {
  return `${encodeTime(now)}${encodeRandom(randomBytes)}`;
}

export function localOrderFromServer(
  order: OrderSummary,
  syncState: LocalOrderSyncState = "synced",
): LocalOrder {
  return {
    id: order.id,
    hubId: order.hubId,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    status: order.status,
    serviceType: order.serviceType,
    deliverySlotId: order.deliverySlotId,
    deliveryAt: order.deliveryAt,
    version: order.version,
    holdComment: order.holdComment,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    cancelledAt: order.cancelledAt,
    syncState,
    lastError: null,
  };
}

type UpdateApplyChangeInput = Exclude<
  ApplyChangeInput,
  { intent: "createOrder" }
>;

export function applyOptimisticIntent(
  order: LocalOrder,
  input: UpdateApplyChangeInput,
  now: number,
): LocalOrder {
  const next: LocalOrder = {
    ...order,
    version: order.version + 1,
    updatedAt: now,
    syncState: "pending",
    lastError: null,
  };

  switch (input.intent) {
    case "reschedule":
      return {
        ...next,
        deliverySlotId: input.payload.deliverySlotId,
      };
    case "markProcessing":
      return {
        ...next,
        status: "processing",
        holdComment: null,
      };
    case "placeOnHold":
      return {
        ...next,
        status: "hold",
        holdComment: input.payload.comments,
      };
    case "releaseHold":
      return {
        ...next,
        status: "processing",
        holdComment: null,
      };
    case "markOutForDelivery":
      return {
        ...next,
        status: "out_for_delivery",
      };
    case "markDelivered":
      return {
        ...next,
        status: "delivered",
      };
    case "cancel":
      return {
        ...next,
        status: "cancelled",
        deliverySlotId: null,
        deliveryAt: null,
        cancelledAt: now,
        holdComment: null,
      };
  }
}
