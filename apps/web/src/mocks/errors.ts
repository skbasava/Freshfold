import type { MockOrderDetail } from "./types";

export type MockApiErrorCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INVALID_TRANSITION"
  | "INVALID_CUSTOMER"
  | "INVALID_SLOT"
  | "HOLD_COMMENT_REQUIRED"
  | "VERSION_CONFLICT"
  | "MUTATION_PAYLOAD_MISMATCH"
  | "SLOT_FULL"
  | "SLOT_CLOSED"
  | "SLOT_PAST"
  | "SLOT_NOT_FOUND"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "REQUEST_TIMEOUT"
  | "SERVER_ERROR";

export interface MockApiErrorOptions {
  status: number;
  code: MockApiErrorCode;
  fieldErrors?: Record<string, string>;
  currentOrder?: MockOrderDetail;
}

export class MockApiError extends Error {
  readonly status: number;
  readonly code: MockApiErrorCode;
  readonly fieldErrors?: Record<string, string>;
  readonly currentOrder?: MockOrderDetail;

  constructor(message: string, options: MockApiErrorOptions) {
    super(message);
    this.name = "MockApiError";
    this.status = options.status;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
    this.currentOrder = options.currentOrder;
  }
}

export function isMockApiError(error: unknown): error is MockApiError {
  return error instanceof MockApiError;
}
