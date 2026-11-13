import {
  apiErrorSchema,
  applyChangeInputSchema,
  applyChangeResultSchema,
  changeFeedResponseSchema,
  customerListResponseSchema,
  customerSchema,
  deliverySlotListResponseSchema,
  orderDetailSchema,
  orderEventsResponseSchema,
  orderListResponseSchema,
  REQUEST_ID_HEADER,
  sessionResponseSchema,
  type ApplyChangeInput,
  type ApplyChangeResult,
  type ChangeFeedResponse,
  type Customer,
  type CustomerListResponse,
  type DeliverySlotListResponse,
  type OrderDetail,
  type OrderEventsResponse,
  type OrderListResponse,
  type SessionResponse,
} from "@laundry/contracts";
import { apiLogger } from "../lib/logger";
import { defaultFetch, type FetchLike } from "../sync/fetch";

export type { FetchLike };

export const UNAUTHORIZED_EVENT = "freshfold:unauthorized";
export const AUTH_FAILURE_EVENT = "freshfold:auth-failure";

export interface AuthFailureDetail {
  status: number;
  code: string;
  requestId?: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface GatewayApiErrorOptions {
  status: number;
  code: string;
  message?: string;
  requestId?: string;
  details?: Array<{ path: string; message: string }>;
  currentOrder?: OrderDetail;
  retryable?: boolean;
}

export class GatewayApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: Array<{ path: string; message: string }>;
  readonly currentOrder?: OrderDetail;
  readonly retryable: boolean;

  constructor(options: GatewayApiErrorOptions) {
    super(options.message ?? options.code);
    this.name = "GatewayApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
    this.currentOrder = options.currentOrder;
    this.retryable =
      options.retryable ??
      (options.status === 0 || options.status === 429 || options.status >= 500);
  }
}

export function isGatewayApiError(error: unknown): error is GatewayApiError {
  return error instanceof GatewayApiError;
}

export interface GatewayClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  requestIdFactory?: () => string;
  getAccessToken?: () => string | null;
  setAccessToken?: (token: string | null) => void;
}

export interface ListOrdersOptions extends RequestOptions {
  limit?: number;
  cursor?: string | null;
}

export interface ListCustomersOptions extends RequestOptions {
  limit?: number;
  cursor?: string | null;
}

export interface ListDeliverySlotsOptions extends RequestOptions {
  date?: string;
}

export interface GetChangesOptions extends RequestOptions {
  since: number;
  limit?: number;
}

export interface GetOrderEventsOptions extends RequestOptions {
  limit?: number;
}

export interface GatewayClient {
  getSession(options?: RequestOptions): Promise<SessionResponse>;
  listCustomers(
    options?: ListCustomersOptions,
  ): Promise<CustomerListResponse>;
  getCustomer(id: string, options?: RequestOptions): Promise<Customer>;
  listOrders(options?: ListOrdersOptions): Promise<OrderListResponse>;
  listDeliverySlots(
    options?: ListDeliverySlotsOptions,
  ): Promise<DeliverySlotListResponse>;
  getOrder(id: string, options?: RequestOptions): Promise<OrderDetail>;
  getChanges(options: GetChangesOptions): Promise<ChangeFeedResponse>;
  getOrderEvents(
    orderId: string,
    options?: GetOrderEventsOptions,
  ): Promise<OrderEventsResponse>;
  applyChange(
    input: ApplyChangeInput,
    options?: RequestOptions,
  ): Promise<ApplyChangeResult>;
}

function buildPath(path: string, query?: URLSearchParams): string {
  if (!query || [...query.keys()].length === 0) {
    return path;
  }
  return `${path}?${query.toString()}`;
}

function buildUrl(baseUrl: string | undefined, path: string): string {
  if (!baseUrl) {
    return path;
  }
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function createGatewayClient(
  options: GatewayClientOptions = {},
): GatewayClient {
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const requestIdFactory =
    options.requestIdFactory ?? (() => crypto.randomUUID());
  const baseUrl = options.baseUrl;

  async function request<T>(
    path: string,
    method: string,
    schema: { parse(value: unknown): T },
    body?: unknown,
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const abortFromCaller = () => controller.abort();

    if (requestOptions.signal) {
      if (requestOptions.signal.aborted) {
        controller.abort();
      } else {
        requestOptions.signal.addEventListener("abort", abortFromCaller, {
          once: true,
        });
      }
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }

    const accessToken = options.getAccessToken?.() ?? null;
    const headers: Record<string, string> = {
      accept: "application/json",
      [REQUEST_ID_HEADER]: requestIdFactory(),
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (accessToken) {
      headers.authorization = `Bearer ${accessToken}`;
    }

    const reqStart = Date.now();
    const reqId = headers[REQUEST_ID_HEADER];
    apiLogger.debug(`-> ${method} ${path}`, { requestId: reqId });

    let response: Response;
    try {
      response = await fetchImpl(buildUrl(baseUrl, path), {
        method,
        credentials: "omit",
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (error) {
      const durationMs = Date.now() - reqStart;
      apiLogger.error(`xx ${method} ${path} (${durationMs}ms)`, {
        durationMs,
        requestId: reqId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (isAbortError(error)) {
        throw new GatewayApiError({
          status: 0,
          code: timedOut ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED",
          message: timedOut
            ? "The request took too long."
            : "The request was cancelled.",
          retryable: true,
        });
      }
      throw new GatewayApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Network error",
        retryable: true,
      });
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      requestOptions.signal?.removeEventListener("abort", abortFromCaller);
    }

    const durationMs = Date.now() - reqStart;

    if (response.status === 204) {
      apiLogger.info(`<- ${method} ${path} 204 (${durationMs}ms)`, {
        durationMs,
        requestId: reqId,
      });
      return schema.parse(undefined);
    }

    let rawBody: unknown = null;
    try {
      rawBody = await response.json();
    } catch {
      rawBody = null;
    }

    if (!response.ok) {
      const parsedError = apiErrorSchema.safeParse(rawBody);
      const errorCode = parsedError.success
        ? parsedError.data.error
        : `HTTP_${response.status}`;

      apiLogger.warn(
        `<- ${method} ${path} ${response.status} [${errorCode}] (${durationMs}ms)`,
        {
          durationMs,
          requestId: reqId,
          status: response.status,
          code: errorCode,
        },
      );
      const isAuthFailure =
        response.status === 401 ||
        (response.status === 403 &&
          (errorCode === "membership_missing" ||
            errorCode === "membership_inactive" ||
            errorCode === "cross_tenant_denied"));
      if (isAuthFailure) {
        if (response.status === 401 && typeof window !== "undefined") {
          window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        }
        if (accessToken) {
          options.setAccessToken?.(null);
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent<AuthFailureDetail>(AUTH_FAILURE_EVENT, {
              detail: {
                status: response.status,
                code: errorCode,
                requestId: parsedError.success
                  ? parsedError.data.requestId
                  : response.headers.get(REQUEST_ID_HEADER) ?? undefined,
              },
            }),
          );
        }
      }

      const parsedOrder =
        rawBody !== null &&
        typeof rawBody === "object" &&
        "order" in rawBody
          ? orderDetailSchema.safeParse(rawBody.order)
          : null;

      throw new GatewayApiError({
        status: response.status,
        code: errorCode,
        requestId: parsedError.success
          ? parsedError.data.requestId
          : response.headers.get(REQUEST_ID_HEADER) ?? undefined,
        details: parsedError.success ? parsedError.data.details : undefined,
        currentOrder:
          parsedOrder && parsedOrder.success ? parsedOrder.data : undefined,
      });
    }

    apiLogger.info(`<- ${method} ${path} ${response.status} (${durationMs}ms)`, {
      durationMs,
      requestId: reqId,
      status: response.status,
    });

    try {
      return schema.parse(rawBody);
    } catch {
      throw new GatewayApiError({
        status: response.status,
        code: "INVALID_RESPONSE",
        message: "The server returned an unexpected response.",
        retryable: true,
      });
    }
  }

  return {
    getSession(requestOptions) {
      return request(
        "/api/me",
        "GET",
        sessionResponseSchema,
        undefined,
        requestOptions,
      );
    },

    listCustomers(listOptions = {}) {
      const query = new URLSearchParams();
      query.set("limit", String(listOptions.limit ?? 50));
      if (listOptions.cursor) {
        query.set("cursor", listOptions.cursor);
      }
      return request(
        buildPath("/api/customers", query),
        "GET",
        customerListResponseSchema,
        undefined,
        listOptions,
      );
    },

    getCustomer(id, requestOptions) {
      return request(
        `/api/customers/${encodeURIComponent(id)}`,
        "GET",
        customerSchema,
        undefined,
        requestOptions,
      );
    },

    listOrders(listOptions = {}) {
      const query = new URLSearchParams();
      query.set("limit", String(listOptions.limit ?? 50));
      if (listOptions.cursor) {
        query.set("cursor", listOptions.cursor);
      }
      return request(
        buildPath("/api/orders", query),
        "GET",
        orderListResponseSchema,
        undefined,
        listOptions,
      );
    },

    listDeliverySlots(listOptions = {}) {
      const query = new URLSearchParams();
      if (listOptions.date) {
        query.set("date", listOptions.date);
      }
      return request(
        buildPath("/api/delivery-slots", query),
        "GET",
        deliverySlotListResponseSchema,
        undefined,
        listOptions,
      );
    },

    getOrder(id, requestOptions) {
      return request(
        `/api/orders/${encodeURIComponent(id)}`,
        "GET",
        orderDetailSchema,
        undefined,
        requestOptions,
      );
    },

    getChanges(changeOptions) {
      const query = new URLSearchParams();
      query.set("since", String(changeOptions.since));
      query.set("limit", String(changeOptions.limit ?? 100));
      return request(
        buildPath("/api/changes", query),
        "GET",
        changeFeedResponseSchema,
        undefined,
        changeOptions,
      );
    },

    getOrderEvents(orderId, eventOptions = {}) {
      const query = new URLSearchParams();
      query.set("limit", String(eventOptions.limit ?? 50));
      return request(
        buildPath(
          `/api/orders/${encodeURIComponent(orderId)}/events`,
          query,
        ),
        "GET",
        orderEventsResponseSchema,
        undefined,
        eventOptions,
      );
    },

    applyChange(input, requestOptions) {
      const parsed = applyChangeInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new GatewayApiError({
          status: 400,
          code: "INVALID_REQUEST",
          message: "The order change is not valid.",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
      return request(
        "/api/orders/apply-change",
        "POST",
        applyChangeResultSchema,
        parsed.data,
        requestOptions,
      );
    },
  };
}
