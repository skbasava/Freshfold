export type ErrorCode =
  | "validation_error"
  | "not_found"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "invariant_violation"
  | "idempotency_conflict"
  | "external_provider_error"
  | "internal_error";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("validation_error", message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", details?: unknown) {
    super("unauthorized", message, 401, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied", details?: unknown) {
    super("forbidden", message, 403, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: unknown) {
    super("not_found", message, 404, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super("conflict", message, 409, details);
  }
}

export class InvariantViolationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("invariant_violation", message, 422, details);
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super("idempotency_conflict", message, 409, details);
  }
}
