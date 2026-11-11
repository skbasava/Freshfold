import {
  applyChangeInputSchema,
  createOrderPayloadSchema,
  type ApplyChangeIntent,
  type CreateOrderItemInput,
} from "@laundry/contracts";
import {
  createPendingMutation,
  type MutationQueue,
} from "../sync/mutation-queue";
import type { LocalOrder, PendingMutation } from "../sync/types";
import {
  applyOptimisticIntent,
  createOrderId,
} from "./local-order";

export interface OfflineCreateOrderInput {
  hubId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  createWithPhone?: boolean;
  serviceType: string;
  deliverySlotId: string;
  deliveryAt?: number | null;
  items: CreateOrderItemInput[];
  orderId?: string;
  now?: number;
}

export interface OfflineUpdateOrderInput {
  orderId: string;
  intent: Exclude<ApplyChangeIntent, "createOrder">;
  payload: unknown;
  now?: number;
}

export interface OfflineWriteResult {
  order: LocalOrder;
  mutation: PendingMutation;
}

export async function createOfflineOrder(
  queue: MutationQueue,
  input: OfflineCreateOrderInput,
): Promise<OfflineWriteResult> {
  const identity = input.createWithPhone
    ? {
        customerName: input.customerName,
        customerPhone: input.customerPhone,
      }
    : { customerId: input.customerId };
  const payload = createOrderPayloadSchema.safeParse({
    ...identity,
    serviceType: input.serviceType,
    deliverySlotId: input.deliverySlotId,
    items: input.items,
  });
  if (!payload.success) {
    throw new Error(
      `Invalid offline order: ${payload.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join(", ")}`,
    );
  }

  const now = input.now ?? Date.now();
  const orderId = input.orderId ?? createOrderId(now);
  const mutation = createPendingMutation({
    orderId,
    intent: "createOrder",
    payload: payload.data,
    baseVersion: null,
    now,
  });
  const order: LocalOrder = {
    id: orderId,
    hubId: input.hubId,
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    status: "confirmed",
    serviceType: input.serviceType,
    deliverySlotId: input.deliverySlotId,
    deliveryAt: input.deliveryAt ?? null,
    version: 1,
    holdComment: null,
    createdAt: now,
    updatedAt: now,
    cancelledAt: null,
    syncState: "pending",
    lastError: null,
  };

  return queue.enqueueOptimistic(order, mutation);
}

export async function updateOfflineOrder(
  queue: MutationQueue,
  input: OfflineUpdateOrderInput,
): Promise<OfflineWriteResult> {
  const existing = await queue.getOrder(input.orderId);
  if (!existing) {
    throw new Error(`Unknown local order: ${input.orderId}`);
  }

  const now = input.now ?? Date.now();
  const mutation = createPendingMutation({
    orderId: input.orderId,
    intent: input.intent,
    payload: input.payload,
    baseVersion: existing.version,
    now,
  });

  const parsed = applyChangeInputSchema.safeParse({
    orderId: input.orderId,
    mutationId: mutation.mutationId,
    intent: input.intent,
    payload: input.payload,
    baseVersion: existing.version,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid offline update: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join(", ")}`,
    );
  }
  if (parsed.data.intent === "createOrder") {
    throw new Error("Use createOfflineOrder for order creation");
  }

  const validatedMutation: PendingMutation = {
    ...mutation,
    payload: parsed.data.payload,
    baseVersion: parsed.data.baseVersion,
  };
  const optimisticOrder = applyOptimisticIntent(
    existing,
    parsed.data,
    now,
  );

  return queue.enqueueOptimistic(optimisticOrder, validatedMutation);
}
