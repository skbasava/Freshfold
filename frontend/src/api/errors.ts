import type { OrderDetail } from "../types";

export type ApiErrorCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INVALID_TRANSITION"
  | "INVALID_CUSTOMER"
  | "INVALID_SLOT"
  | "HOLD_COMMENT_REQUIRED"
  | "VERSION_CONFLICT"
  | "CODE_ALREADY_EXISTS"
  | "SLUG_ALREADY_EXISTS"
  | "MUTATION_PAYLOAD_MISMATCH"
  | "SLOT_FULL"
  | "SLOT_CLOSED"
  | "SLOT_PAST"
  | "SLOT_NOT_FOUND"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "REQUEST_TIMEOUT"
  | "SERVER_ERROR"
  | string;

export interface ApiErrorOptions {
  status: number;
  code: ApiErrorCode;
  fieldErrors?: Record<string, string>;
  currentOrder?: OrderDetail;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fieldErrors?: Record<string, string>;
  readonly currentOrder?: OrderDetail;
  readonly requestId?: string;

  constructor(message: string, options: ApiErrorOptions) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
    this.currentOrder = options.currentOrder;
    this.requestId = options.requestId;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError || (error instanceof Error && "code" in error && "status" in error);
}

// Backward-compatibility aliases
export { ApiError as MockApiError };
export { isApiError as isMockApiError };
export type { ApiErrorCode as MockApiErrorCode };
export type { ApiErrorOptions as MockApiErrorOptions };

