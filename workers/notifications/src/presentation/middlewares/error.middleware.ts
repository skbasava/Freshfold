import type { ErrorHandler } from "hono";

export const errorHandler: ErrorHandler = (err, c) => {
  console.error("[Notification Worker Error]:", err);

  const status = (err as any).status || 500;
  const message = err.message || "Internal server error occurred";

  return c.json(
    {
      error: status >= 500 ? "InternalServerError" : "BadRequest",
      message,
      timestamp: new Date().toISOString(),
    },
    status,
  );
};
