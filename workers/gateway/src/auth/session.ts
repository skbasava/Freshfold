import type { MiddlewareHandler } from "hono";
import type { InternalContext } from "../../../../packages/contracts/src/auth";
import { internalContextSchema } from "../../../../packages/contracts/src/auth";
import type { GatewayEnv } from "../types";

export async function verifySession(
  auth: Fetcher,
  cookie: string,
): Promise<InternalContext | null> {
  const response = await auth.fetch(
    new Request("https://auth.internal/internal/session", {
      headers: {
        accept: "application/json",
        cookie,
      },
    }),
  );

  if (!response.ok) {
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }

  const parsed = internalContextSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export const requireSession: MiddlewareHandler<GatewayEnv> = async (
  c,
  next,
) => {
  const cookie = c.req.header("cookie");
  if (!cookie) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const context = await verifySession(c.env.AUTH, cookie);
  if (!context) {
    return c.json({ error: "unauthorized" }, 401);
  }

  c.set("auth", context);
  await next();
};
