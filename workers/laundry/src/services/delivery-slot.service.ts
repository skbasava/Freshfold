import type { DeliverySlotListResponse } from "../../../../packages/contracts/src/orders";
import type { Logger } from "../../../../packages/shared/src/observability";
import type {
  IDeliverySlotRepository,
  IDeliverySlotService,
} from "../interfaces/delivery-slot.interface";

export class DeliverySlotService implements IDeliverySlotService {
  constructor(
    private readonly slotRepo: IDeliverySlotRepository,
    private readonly logger?: Logger,
  ) {}

  async listSlots(hubId: string, date?: string): Promise<DeliverySlotListResponse> {
    this.logger?.debug("slot_service_list_requested", { hubId, date });

    const items = await this.slotRepo.listActive(hubId, date);

    this.logger?.info("slot_service_list_success", {
      hubId,
      date,
      count: items.length,
    });

    return { items };
  }
}

