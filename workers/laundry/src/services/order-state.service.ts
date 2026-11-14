import type { OrderStatus } from "../../../../packages/contracts/src/orders";
import type { ApplyChangeIntent } from "../../../../packages/contracts/src/mutations";
import {
  orderStateSnapshotSchema,
  type OrderStateSnapshot,
  type OrderDiagnosticStatus,
} from "../../../../packages/contracts/src/crn";
import { nextStatus, type UpdateIntent } from "../domain/state-machine";

// In-memory fallback map for unit tests / local environments without KV binding
const memoryKvFallback = new Map<string, string>();

export class OrderStateService {
  /**
   * Save a state snapshot to Cloudflare KV (or fallback).
   */
  static async saveState(
    kv: KVNamespace | undefined,
    snapshot: OrderStateSnapshot,
  ): Promise<OrderStateSnapshot> {
    const validated = orderStateSnapshotSchema.parse(snapshot);
    const json = JSON.stringify(validated);

    if (kv) {
      await kv.put(validated.crnId, json);
    } else {
      memoryKvFallback.set(validated.crnId, json);
    }

    return validated;
  }

  /**
   * Retrieve an order state snapshot from Cloudflare KV (or fallback).
   */
  static async getState(
    kv: KVNamespace | undefined,
    crnId: string,
  ): Promise<OrderStateSnapshot | null> {
    let json: string | null = null;
    if (kv) {
      json = await kv.get(crnId);
    } else {
      json = memoryKvFallback.get(crnId) ?? null;
    }

    if (!json) {
      return null;
    }

    try {
      const parsed = JSON.parse(json);
      const validated = orderStateSnapshotSchema.safeParse(parsed);
      return validated.success ? validated.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Initialize state in KV upon order creation.
   */
  static async initializeOrderState(
    kv: KVNamespace | undefined,
    params: {
      crnId: string;
      orderId: string;
      tenantId: string | number;
      hubId: string | number;
      actor: {
        actorType: "user" | "service" | "system";
        actorId: string | null;
        role?: string;
      };
      now?: number;
      mutationId?: string;
    },
  ): Promise<OrderStateSnapshot> {
    const snapshot: OrderStateSnapshot = {
      crnId: params.crnId,
      orderId: params.orderId,
      tenantId: params.tenantId,
      hubId: params.hubId,
      previousState: null,
      currentState: "confirmed",
      intent: "createOrder",
      version: 1,
      changedAt: params.now ?? Date.now(),
      actor: params.actor,
      diagnostic: {
        status: "healthy",
        reason: null,
        brokenStep: null,
        lastMutationId: params.mutationId ?? `init_${params.orderId}`,
      },
    };

    return this.saveState(kv, snapshot);
  }

  /**
   * Transition order state in KV, tracking previous and current state,
   * or recording diagnostic failure if transition is broken.
   */
  static async transitionOrderState(
    kv: KVNamespace | undefined,
    params: {
      crnId: string;
      orderId: string;
      tenantId: string | number;
      hubId: string | number;
      intent: ApplyChangeIntent;
      newVersion: number;
      actor: {
        actorType: "user" | "service" | "system";
        actorId: string | null;
        role?: string;
      };
      holdComment?: string | null;
      reason?: string | null;
      now?: number;
      mutationId: string;
    },
  ): Promise<{ snapshot: OrderStateSnapshot; isSuccess: boolean }> {
    const existing = await this.getState(kv, params.crnId);
    const currentStatus: OrderStatus = existing?.currentState ?? "confirmed";

    // Validate transition via state-machine
    const targetStatus =
      params.intent === "createOrder"
        ? "confirmed"
        : nextStatus(currentStatus, params.intent as UpdateIntent);

    const now = params.now ?? Date.now();

    if (!targetStatus) {
      // Transition is INVALID -> record broken flow diagnostic into KV!
      const brokenSnapshot: OrderStateSnapshot = {
        crnId: params.crnId,
        orderId: params.orderId,
        tenantId: params.tenantId,
        hubId: params.hubId,
        previousState: existing?.previousState ?? null,
        currentState: currentStatus,
        intent: params.intent,
        version: existing?.version ?? params.newVersion,
        changedAt: now,
        actor: params.actor,
        diagnostic: {
          status: "broken",
          reason: `Invalid transition: cannot apply intent "${params.intent}" to state "${currentStatus}"`,
          brokenStep: params.intent,
          lastMutationId: params.mutationId,
          errorCode: "INVALID_TRANSITION",
          errorMessage: `Cannot move order from ${currentStatus} via ${params.intent}`,
        },
      };

      await this.saveState(kv, brokenSnapshot);
      return { snapshot: brokenSnapshot, isSuccess: false };
    }

    // Valid transition -> update previousState and currentState
    let diagnosticStatus: OrderDiagnosticStatus = "healthy";
    if (params.intent === "placeOnHold") {
      diagnosticStatus = "held";
    } else if (params.intent === "cancel") {
      diagnosticStatus = "cancelled";
    }

    const newSnapshot: OrderStateSnapshot = {
      crnId: params.crnId,
      orderId: params.orderId,
      tenantId: params.tenantId,
      hubId: params.hubId,
      previousState: currentStatus,
      currentState: targetStatus,
      intent: params.intent,
      version: params.newVersion,
      changedAt: now,
      actor: params.actor,
      diagnostic: {
        status: diagnosticStatus,
        reason: params.holdComment ?? params.reason ?? null,
        brokenStep: null,
        lastMutationId: params.mutationId,
      },
    };

    await this.saveState(kv, newSnapshot);
    return { snapshot: newSnapshot, isSuccess: true };
  }

  /**
   * For testing or reset
   */
  static clearMemoryFallback(): void {
    memoryKvFallback.clear();
  }
}

