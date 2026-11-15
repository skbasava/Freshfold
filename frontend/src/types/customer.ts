import type { Customer } from "@laundry/contracts";
import type { OrderSummary } from "./order";

export type CustomerSummary = Customer;

export interface CustomerListItem extends CustomerSummary {
  orderCount: number;
  lastOrderAt: number | null;
}

export interface CustomerListQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomerListResult {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface CustomerDetail {
  customer: CustomerSummary;
  orders: OrderSummary[];
}

