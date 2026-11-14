import type {
  DeliverySlot,
  DeliverySlotListResponse,
} from "../../../../packages/contracts/src/orders";

export interface IDeliverySlotRepository {
  listActive(hubId: string, date?: string): Promise<DeliverySlot[]>;
}

export interface IDeliverySlotService {
  listSlots(hubId: string, date?: string): Promise<DeliverySlotListResponse>;
}

