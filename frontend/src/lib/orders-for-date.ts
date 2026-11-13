import type { AppApi } from "../api/types";
import { localDateKey } from "./format";
import type { MockOrderSummary } from "../mocks/types";

const PAGE_SIZE = 50;
const MAX_PAGES = 20;

export async function listOrdersForDate(
  api: Pick<AppApi, "listOrders">,
  dateKey: string,
): Promise<MockOrderSummary[]> {
  const orders = new Map<string, MockOrderSummary>();
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount && page <= MAX_PAGES) {
    const result = await api.listOrders({
      page,
      pageSize: PAGE_SIZE,
      sort: "delivery",
    });
    for (const order of result.items) {
      orders.set(order.id, order);
    }
    pageCount = result.pageCount;
    page += 1;
  }

  return [...orders.values()]
    .filter(
      (order) =>
        order.deliveryAt !== null &&
        localDateKey(order.deliveryAt) === dateKey,
    )
    .sort(
      (left, right) => (left.deliveryAt ?? 0) - (right.deliveryAt ?? 0),
    );
}
