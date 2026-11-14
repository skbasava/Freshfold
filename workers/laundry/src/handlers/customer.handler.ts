import type { Context } from "hono";
import {
  customerListResponseSchema,
  customerSchema,
} from "../../../../packages/contracts/src/orders";
import type { LaundryEnv } from "../authz";
import { getLaundryLogger } from "../logging";
import { parseListQuery } from "../pagination";
import { CustomerRepository } from "../repositories/customer.repository";
import { CustomerService } from "../services/customer.service";

export async function listCustomersHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const query = parseListQuery(c.req.query());
  if (!query) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  const actor = c.get("actor");
  logger.debug("handler_list_customers", { hubId: actor.hubId, query });

  const repo = new CustomerRepository(db, getLaundryLogger(c.env, c.get("requestId"), "repository"));
  const service = new CustomerService(repo, getLaundryLogger(c.env, c.get("requestId"), "service"));

  const result = await service.listCustomers(actor.hubId, {
    limit: query.limit,
    cursor: query.cursor ?? null,
  });

  return c.json(customerListResponseSchema.parse(result));
}

export async function getCustomerHandler(c: Context<LaundryEnv>) {
  const db = c.env.LAUNDRY_DB;
  if (!db) {
    return c.json({ error: "database_unavailable" }, 503);
  }

  const actor = c.get("actor");
  const id = c.req.param("id") ?? "";
  const logger = getLaundryLogger(c.env, c.get("requestId"), "handler");
  logger.debug("handler_get_customer", { hubId: actor.hubId, customerId: id });

  const repo = new CustomerRepository(db, getLaundryLogger(c.env, c.get("requestId"), "repository"));
  const service = new CustomerService(repo, getLaundryLogger(c.env, c.get("requestId"), "service"));

  const customer = await service.getCustomer(actor.hubId, id);
  if (!customer) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(customerSchema.parse(customer));
}
