import type {
  Customer,
  CustomerListResponse,
} from "../../../../packages/contracts/src/orders";
import type { Logger } from "../../../../packages/shared/src/observability";
import type {
  ICustomerRepository,
  ICustomerService,
} from "../interfaces/customer.interface";
import { decodeCursor } from "../pagination";

export class CustomerService implements ICustomerService {
  constructor(
    private readonly customerRepo: ICustomerRepository,
    private readonly logger?: Logger,
  ) {}

  async listCustomers(
    hubId: string,
    query: { limit: number; cursor: string | null },
  ): Promise<CustomerListResponse> {
    this.logger?.debug("customer_service_list_requested", {
      hubId,
      limit: query.limit,
      cursor: query.cursor,
    });

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const result = await this.customerRepo.list(hubId, {
      limit: query.limit,
      cursor,
    });

    this.logger?.info("customer_service_list_success", {
      hubId,
      count: result.items.length,
      hasNext: Boolean(result.nextCursor),
    });

    return result;
  }

  async getCustomer(hubId: string, id: string): Promise<Customer | null> {
    this.logger?.debug("customer_service_get_requested", { hubId, customerId: id });

    const customer = await this.customerRepo.getById(hubId, id);
    if (!customer) {
      this.logger?.debug("customer_service_get_not_found", {
        hubId,
        customerId: id,
      });
      return null;
    }

    this.logger?.info("customer_service_get_success", {
      hubId,
      customerId: id,
    });
    return customer;
  }
}

