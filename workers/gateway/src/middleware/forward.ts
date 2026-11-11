import type { MiddlewareHandler } from "hono";
import {
  CSRF_HEADER,
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  MAX_JSON_BODY_BYTES,
  REQUEST_ID_HEADER,
  SERVICE_HUB_HEADER,
  SERVICE_NAME_HEADER,
  SERVICE_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
} from "../../../../packages/contracts/src/http";
import { errorResponse } from "./errors";
import type { GatewayEnv } from "../types";

const CLIENT_IDENTITY_HEADERS = [
  "cookie",
  "authorization",
  CSRF_HEADER,
  "x-actor-id",
  "x-role",
  "x-hub-id",
  "x-tenant-id",
  "x-employee-id",
  "x-user-id",
  "x-permissions",
  "x-auth-source",
  "x-supabase-subject",
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  INTERNAL_KEY_ID_HEADER,
  SERVICE_TOKEN_HEADER,
  SERVICE_NAME_HEADER,
  SERVICE_TENANT_HEADER,
  SERVICE_HUB_HEADER,
];

export const forwardToLaundry: MiddlewareHandler<GatewayEnv> = async (c) => {
  const laundry = c.env.LAUNDRY;
  if (!laundry) {
    return errorResponse(c, 503, "upstream_unavailable");
  }

  const source = new URL(c.req.url);
  const target = new URL(
    `https://laundry.internal${source.pathname}${source.search}`,
  );
  const headers = new Headers(c.req.raw.headers);
  for (const name of CLIENT_IDENTITY_HEADERS) {
    headers.delete(name);
  }
  headers.set(REQUEST_ID_HEADER, c.get("requestId"));
  for (const [name, value] of Object.entries(c.get("internalHeaders"))) {
    headers.set(name, value);
  }

  const method = c.req.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await c.req.arrayBuffer() : undefined;
  if (body && body.byteLength > MAX_JSON_BODY_BYTES) {
    return errorResponse(c, 413, "payload_too_large");
  }

  const upstream = await laundry.fetch(
    new Request(target, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
    }),
  );
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set(REQUEST_ID_HEADER, c.get("requestId"));
  responseHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
};
