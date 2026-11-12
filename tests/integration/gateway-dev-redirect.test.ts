import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import gateway from "../../workers/gateway/src/index";

async function send(
  path: string,
  env: Record<string, unknown>,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(`http://localhost:8787${path}`, init);
  const ctx = createExecutionContext();
  const response = await gateway.fetch(request, env as never, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("gateway dev frontend redirect", () => {
  it("redirects non-API GET requests to Vite when configured in development", async () => {
    const env = {
      ENVIRONMENT: "development",
      DEV_FRONTEND_URL: "http://localhost:5173",
    };

    const root = await send("/", env);
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("http://localhost:5173/");

    const nested = await send("/orders?status=hold", env);
    expect(nested.status).toBe(302);
    expect(nested.headers.get("location")).toBe(
      "http://localhost:5173/orders?status=hold",
    );
  });

  it("never redirects API, health, or non-GET requests", async () => {
    const env = {
      ENVIRONMENT: "development",
      DEV_FRONTEND_URL: "http://localhost:5173",
    };

    const health = await send("/health", env);
    expect(health.status).toBe(200);

    const apiUnknown = await send("/api/nonexistent", env);
    expect(apiUnknown.status).toBe(401);

    const postRoot = await send("/", env, { method: "POST" });
    expect(postRoot.status).toBe(404);
  });

  it("ignores DEV_FRONTEND_URL outside development", async () => {
    for (const environment of ["staging", "production", undefined]) {
      const response = await send("/", {
        ...(environment ? { ENVIRONMENT: environment } : {}),
        DEV_FRONTEND_URL: "http://localhost:5173",
      });
      expect(response.status).toBe(404);
    }
  });
});
