import type { Context } from "hono";
import type { ZodError } from "zod";
import type { ApiError } from "../../../../packages/contracts/src/http";
import type { GatewayEnv } from "../types";

type ErrorStatus = 400 | 401 | 403 | 404 | 413 | 429 | 500 | 503;

export function errorResponse(
  c: Context<GatewayEnv>,
  status: ErrorStatus,
  error: string,
  details?: ApiError["details"],
): Response {
  const body: ApiError = {
    error,
    requestId: c.get("requestId"),
    ...(details ? { details } : {}),
  };

  return c.json(body, status);
}

export function validationDetails(error: ZodError): ApiError["details"] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
