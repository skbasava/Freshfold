import { assertDeliveryStatusTransition } from "../../domain/entities/delivery";
import type { CustomerRepository } from "../../domain/repositories/customer.repository";
import type {
  DeliveryRecord,
  DeliveryRepository,
  DeliveryWithHistory,
} from "../../domain/repositories/delivery.repository";
import type { OrderRepository } from "../../domain/repositories/order.repository";
import type { SystemRepository } from "../../domain/repositories/system.repository";
import type { DeliveryStatus, DeliveryType } from "../../shared/constants";
import { NotFoundError, ValidationError } from "../../shared/errors";
import {
  clampPageLimit,
  decodeCursor,
  type CursorPage,
} from "../../shared/pagination";
import type { Clock } from "../../shared/time";

export interface DeliveryUseCasesDeps {
  orders: OrderRepository;
  customers: CustomerRepository;
  deliveries: DeliveryRepository;
  system: SystemRepository;
  clock: Clock;
}

export class DeliveryUseCases {
  constructor(private readonly deps: DeliveryUseCasesDeps) {}

  async createDelivery(
    orderId: number,
    input: {
      deliveryType: DeliveryType;
      customerAddressId?: number | null;
      addressSnapshot?: {
        line1: string;
        line2?: string | null;
        landmark?: string | null;
        city: string;
        state: string;
        stateCode: string;
        postalCode: string;
      };
      contactName?: string;
      contactPhone?: string;
      scheduledAt: string;
      windowStartAt?: string | null;
      windowEndAt?: string | null;
      notes?: string | null;
      actorUserId?: number | null;
    },
  ): Promise<DeliveryWithHistory> {
    const order = await this.deps.orders.findById(orderId);
    if (!order) {
      throw new NotFoundError(`Order #${orderId} not found`);
    }
    const customer = await this.deps.customers.findById(order.customerId);
    if (!customer) {
      throw new NotFoundError(`Customer #${order.customerId} not found`);
    }

    let snapshotObj = input.addressSnapshot;
    const resolvedAddressId =
      input.customerAddressId ??
      (input.deliveryType === "pickup"
        ? order.pickupAddressId
        : order.deliveryAddressId);

    if (!snapshotObj) {
      if (!resolvedAddressId) {
        throw new ValidationError(
          "Either customerAddressId or explicit addressSnapshot is required",
        );
      }
      const addr = await this.deps.customers.findAddressById(resolvedAddressId);
      if (!addr || addr.customerId !== customer.id) {
        throw new NotFoundError(`Customer address #${resolvedAddressId} not found`);
      }
      snapshotObj = {
        line1: addr.line1,
        line2: addr.line2,
        landmark: addr.landmark,
        city: addr.city,
        state: addr.state,
        stateCode: addr.stateCode,
        postalCode: addr.postalCode,
      };
    }

    const nowIso = this.deps.clock.nowIso();
    const created = await this.deps.deliveries.create({
      delivery: {
        branchId: order.branchId,
        orderId: order.id,
        customerId: customer.id,
        customerAddressId: resolvedAddressId ?? null,
        deliveryType: input.deliveryType,
        status: "scheduled",
        addressSnapshotJson: JSON.stringify(snapshotObj),
        contactName: input.contactName ?? customer.fullName,
        contactPhone: input.contactPhone ?? customer.phone,
        scheduledAt: input.scheduledAt,
        windowStartAt: input.windowStartAt ?? null,
        windowEndAt: input.windowEndAt ?? null,
        completedAt: null,
        proofR2Key: null,
        notes: input.notes ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      changedByUserId: input.actorUserId ?? null,
    });

    await this.deps.system.recordAudit({
      actorUserId: input.actorUserId ?? null,
      action: "delivery.scheduled",
      entityType: "delivery",
      entityId: String(created.delivery.id),
      summaryJson: JSON.stringify({
        orderId: order.id,
        deliveryType: input.deliveryType,
        scheduledAt: input.scheduledAt,
      }),
      nowIso,
    });

    return created;
  }

  async getDelivery(id: number): Promise<DeliveryWithHistory> {
    const result = await this.deps.deliveries.findWithHistory(id);
    if (!result) {
      throw new NotFoundError(`Delivery #${id} not found`);
    }
    return result;
  }

  listDeliveries(params: {
    orderId?: number;
    customerId?: number;
    status?: DeliveryStatus;
    scheduledFrom?: string;
    scheduledTo?: string;
    limit?: number;
    cursor?: string;
  }): Promise<CursorPage<DeliveryRecord>> {
    return this.deps.deliveries.list({
      ...params,
      limit: clampPageLimit(params.limit),
      cursor: params.cursor ? decodeCursor(params.cursor) : undefined,
    });
  }

  async transitionStatus(
    deliveryId: number,
    input: {
      toStatus: DeliveryStatus;
      reason?: string | null;
      proofR2Key?: string | null;
      actorUserId?: number | null;
    },
  ): Promise<DeliveryRecord> {
    const existing = await this.deps.deliveries.findById(deliveryId);
    if (!existing) {
      throw new NotFoundError(`Delivery #${deliveryId} not found`);
    }

    assertDeliveryStatusTransition(existing.status, input.toStatus);
    const nowIso = this.deps.clock.nowIso();

    const updated = await this.deps.deliveries.transitionStatus({
      deliveryId,
      fromStatus: existing.status,
      toStatus: input.toStatus,
      reason: input.reason ?? null,
      completedAt: input.toStatus === "completed" ? nowIso : existing.completedAt,
      proofR2Key: input.proofR2Key ?? existing.proofR2Key,
      changedByUserId: input.actorUserId ?? null,
      nowIso,
    });

    await this.deps.system.recordAudit({
      actorUserId: input.actorUserId ?? null,
      action: "delivery.status_changed",
      entityType: "delivery",
      entityId: String(deliveryId),
      summaryJson: JSON.stringify({
        fromStatus: existing.status,
        toStatus: input.toStatus,
      }),
      nowIso,
    });

    return updated;
  }
}
