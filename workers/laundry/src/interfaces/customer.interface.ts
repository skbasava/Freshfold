import type { Customer, CustomerListResponse } from "../../../../packages/contracts/src/orders";
import type { Cursor } from "../pagination";

export interface ICustomerRepository {
  list(
    hubId: string,
    options: { limit: number; cursor: Cursor | null },
  ): Promise<CustomerListResponse>;
  getById(hubId: string, id: string): Promise<Customer | null>;
  findByPhone(hubId: string, phone: string): Promise<Customer | null>;
  create(customer: Customer): Promise<void>;
}

export interface ICustomerService {
  listCustomers(
    hubId: string,
    query: { limit: number; cursor: string | null },
  ): Promise<CustomerListResponse>;
  getCustomer(hubId: string, id: string): Promise<Customer | null>;
}

