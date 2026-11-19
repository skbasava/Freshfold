import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { AppError } from "../../shared/errors";
import type { ApiHonoEnv } from "../types";

export const errorHandler: ErrorHandler<ApiHonoEnv> = (error, c) => {
  const requestId = c.get("requestId") ?? "unknown";

  if (error instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
          requestId,
        },
      },
      400,
    );
  }

  if (error instanceof AppError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
          requestId,
        },
      },
      error.statusCode as 400 | 401 | 403 | 404 | 409 | 422 | 500,
    );
  }

  console.error(
    JSON.stringify({
      event: "unhandled_error",
      requestId,
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    }),
  );

  return c.json(
    {
      error: {
        code: "internal_error",
        message: "An unexpected internal error occurred",
        requestId,
      },
    },
    500,
  );
};
