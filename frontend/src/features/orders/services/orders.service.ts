import type { OrderStatus } from "@laundry/contracts";
import { apiFetch } from "@/lib/http/api-client";
import type {
  CalendarEventInfo,
  CreateOrderPayload,
  CustomerBillingSummary,
  OrderDetail,
  OrderListItem,
  OrderBillingSummary,
  PaymentItem,
  PaymentMethod,
  PricingQuoteResult,
  RefundItem,
} from "../types/orders.types";

export function formatPaiseToInr(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(d);
  } catch {
    return iso;
  }
}

export interface OrdersService {
  listOrders(params?: {
    status?: OrderStatus | "all";
    limit?: number;
  }): Promise<{ items: OrderListItem[]; hasMore: boolean; nextCursor: string | null }>;
  getOrder(id: number): Promise<OrderDetail>;
  calculateQuote(input: {
    customerId: number;
    lines: CreateOrderPayload["lines"];
  }): Promise<PricingQuoteResult>;
  createOrder(payload: CreateOrderPayload): Promise<OrderDetail>;
  updateOrder(
    id: number,
    payload: {
      lines: CreateOrderPayload["lines"];
      specialInstructions?: string | null;
      promisedDeliveryAt?: string | null;
    },
  ): Promise<OrderDetail>;
  transitionStatus(
    id: number,
    toStatus: OrderStatus,
    reason?: string,
  ): Promise<OrderListItem>;
  addNote(id: number, note: string): Promise<void>;
  getCalendarEvent(id: number): Promise<CalendarEventInfo | null>;
  syncCalendarEvent(id: number): Promise<CalendarEventInfo>;
  getOrderBilling(id: number): Promise<OrderBillingSummary>;
  recordPayment(
    orderId: number,
    input: {
      paymentMethod: PaymentMethod;
      amountPaise: number;
      notes?: string;
    },
  ): Promise<{ payment: PaymentItem; billing: OrderBillingSummary }>;
  processRefund(
    paymentId: number,
    input: {
      amountPaise: number;
      reason: string;
    },
  ): Promise<{ refund: RefundItem; payment: PaymentItem }>;
  getCustomerBilling(customerId: number): Promise<CustomerBillingSummary>;
  sendNotification(
    orderId: number,
    input: {
      channel: "whatsapp" | "sms";
      recipientPhone: string;
      message: string;
    },
  ): Promise<{ success: boolean; channel: string; status: string }>;
}

export function createOrdersService(fetchImpl: typeof fetch = fetch): OrdersService {
  return {
    async listOrders(params = {}) {
      const query = new URLSearchParams();
      if (params.status && params.status !== "all") {
        query.set("status", params.status);
      }
      query.set("limit", String(params.limit ?? 50));

      const res = await apiFetch(`/api/v1/orders?${query.toString()}`, {
        method: "GET",
        fetchImpl,
      });

      if (!res.ok) {
        throw new Error(`Failed to load orders (HTTP ${res.status})`);
      }

      const json = (await res.json()) as {
        data: {
          items: OrderListItem[];
          hasMore: boolean;
          nextCursor: string | null;
        };
      };

      return json.data;
    },

    async getOrder(id: number) {
      const res = await apiFetch(`/api/v1/orders/${id}`, {
        method: "GET",
        fetchImpl,
      });

      if (!res.ok) {
        throw new Error(`Order #${id} not found or could not be loaded`);
      }

      const json = (await res.json()) as { data: OrderDetail };
      return json.data;
    },

    async calculateQuote(input) {
      const res = await apiFetch("/api/v1/pricing/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        fetchImpl,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Failed to calculate quote");
      }

      const json = (await res.json()) as { data: PricingQuoteResult };
      return json.data;
    },

    async createOrder(payload) {
      const idempotencyKey = `ord-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const res = await apiFetch("/api/v1/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(payload),
        fetchImpl,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Failed to create order");
      }

      const json = (await res.json()) as { data: OrderDetail };
      return json.data;
    },

    async updateOrder(id, payload) {
      const res = await apiFetch(`/api/v1/orders/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        fetchImpl,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Failed to update order");
      }

      const json = (await res.json()) as { data: OrderDetail };
      return json.data;
    },

    async transitionStatus(id, toStatus, reason) {
      const res = await apiFetch(`/api/v1/orders/${id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toStatus, reason }),
        fetchImpl,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Status transition rejected");
      }

      const json = (await res.json()) as { data: OrderListItem };
      return json.data;
    },

    async addNote(id, note) {
      const res = await apiFetch(`/api/v1/orders/${id}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note, isInternal: true }),
        fetchImpl,
      });

      if (!res.ok) {
        throw new Error("Failed to add internal note");
      }
    },

    async getCalendarEvent(id) {
      const res = await apiFetch(`/api/v1/orders/${id}/calendar-event`, {
        method: "GET",
        fetchImpl,
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data: CalendarEventInfo | null };
      return json.data;
    },

    async syncCalendarEvent(id) {
      const res = await apiFetch(`/api/v1/orders/${id}/calendar-event`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        fetchImpl,
      });
      if (!res.ok) {
        throw new Error("Failed to sync Google Calendar event");
      }
      const json = (await res.json()) as { data: CalendarEventInfo };
      return json.data;
    },

    async getOrderBilling(id) {
      const res = await apiFetch(`/api/v1/orders/${id}/billing`, {
        method: "GET",
        fetchImpl,
      });
      if (!res.ok) {
        throw new Error(`Failed to load billing summary for Order #${id}`);
      }
      const json = (await res.json()) as { data: OrderBillingSummary };
      return json.data;
    },

    async recordPayment(orderId, input) {
      const idempotencyKey = `pay-${orderId}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
      const res = await apiFetch(`/api/v1/orders/${orderId}/payments`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(input),
        fetchImpl,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Failed to record payment");
      }
      const json = (await res.json()) as {
        data: { payment: PaymentItem; billing: OrderBillingSummary };
      };
      return json.data;
    },

    async processRefund(paymentId, input) {
      const idempotencyKey = `ref-${paymentId}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
      const res = await apiFetch(`/api/v1/payments/${paymentId}/refunds`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(input),
        fetchImpl,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Failed to process refund");
      }
      const json = (await res.json()) as {
        data: { refund: RefundItem; payment: PaymentItem };
      };
      return json.data;
    },

    async getCustomerBilling(customerId) {
      const res = await apiFetch(`/api/v1/customers/${customerId}/billing`, {
        method: "GET",
        fetchImpl,
      });
      if (!res.ok) {
        throw new Error(`Failed to load customer billing for Customer #${customerId}`);
      }
      const json = (await res.json()) as { data: CustomerBillingSummary };
      return json.data;
    },

    async sendNotification(orderId, input) {
      const res = await apiFetch(`/api/v1/orders/${orderId}/notify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        fetchImpl,
      });
      if (!res.ok) {
        throw new Error("Failed to record notification dispatch");
      }
      const json = (await res.json()) as {
        data: { success: boolean; channel: string; status: string };
      };
      return json.data;
    },
  };
}

export const defaultOrdersService: OrdersService = createOrdersService();
