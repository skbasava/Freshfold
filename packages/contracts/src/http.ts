import { z } from "zod";
import { internalContextSchema } from "./auth";

export const REQUEST_ID_HEADER = "x-request-id";
export const INTERNAL_CONTEXT_HEADER = "x-internal-context";
export const INTERNAL_SIGNATURE_HEADER = "x-internal-signature";
export const INTERNAL_KEY_ID_HEADER = "x-internal-key-id";
export const CSRF_HEADER = "x-csrf-token";
export const CSRF_COOKIE = "laundry_csrf";
export const SERVICE_TOKEN_HEADER = "x-service-token";
export const SERVICE_NAME_HEADER = "x-service-name";
export const SERVICE_TENANT_HEADER = "x-service-tenant-id";
export const SERVICE_HUB_HEADER = "x-service-hub-id";

export const MAX_JSON_BODY_BYTES = 64 * 1024;
export const SIGNED_CONTEXT_TTL_MS = 60_000;

export const signedContextSchema = internalContextSchema.extend({
  iat: z.number().int().positive(),
  nonce: z.string().uuid(),
});
export type SignedContext = z.infer<typeof signedContextSchema>;

export const apiErrorSchema = z.object({
  error: z.string().min(1),
  requestId: z.string().min(1).optional(),
  details: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
