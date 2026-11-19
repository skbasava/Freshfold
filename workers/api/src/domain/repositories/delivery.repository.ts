import type { DeliveryStatus, DeliveryType } from "../../shared/constants";
import type { CursorPage, CursorPayload } from "../../shared/pagination";

export interface DeliveryRecord {
  id: number;
  branchId: number;
  orderId: number;
  customerId: number;
  customerAddressId: number | null;
  deliveryType: DeliveryType;
  status: DeliveryStatus;
  addressSnapshotJson: string;
  contactName: string;
  contactPhone: string;
  scheduledAt: string;
  windowStartAt: string | null;
  windowEndAt: string | null;
  completedAt: string | null;
  proofR2Key: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryStatusHistoryRecord {
  id: number;
  deliveryId: number;
  fromStatus: DeliveryStatus | null;
  toStatus: DeliveryStatus;
  reason: string | null;
  changedByUserId: number | null;
  createdAt: string;
}

export interface DeliveryWithHistory {
  delivery: DeliveryRecord;
  history: DeliveryStatusHistoryRecord[];
}

export interface DeliveryRepository {
  create(input: {
    delivery: Omit<DeliveryRecord, "id">;
    changedByUserId?: number | null;
  }): Promise<DeliveryWithHistory>;
  findById(id: number): Promise<DeliveryRecord | null>;
  findWithHistory(id: number): Promise<DeliveryWithHistory | null>;
  list(params: {
    orderId?: number;
    customerId?: number;
    status?: DeliveryStatus;
    scheduledFrom?: string;
    scheduledTo?: string;
    limit: number;
    cursor?: CursorPayload;
  }): Promise<CursorPage<DeliveryRecord>>;
  transitionStatus(input: {
    deliveryId: number;
    fromStatus: DeliveryStatus;
    toStatus: DeliveryStatus;
    reason?: string | null;
    completedAt?: string | null;
    proofR2Key?: string | null;
    changedByUserId?: number | null;
    nowIso: string;
  }): Promise<DeliveryRecord>;
}
