import type { MiddlewareHandler } from "hono";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  SIGNED_CONTEXT_TTL_MS,
  type SignedContext,
} from "../../../../packages/contracts/src/http";
import { signInternalContext } from "../../../../packages/shared/src/internal-context";
import type { GatewayEnv } from "../types";

export const signedContext: MiddlewareHandler<GatewayEnv> = async (c, next) => {
  const auth = c.get("auth");
  const now = Date.now();
  const context: SignedContext = {
    ...auth,
    iat: now,
    exp: Math.min(auth.exp, now + SIGNED_CONTEXT_TTL_MS),
    nonce: crypto.randomUUID(),
  };
  const signed = await signInternalContext({
    context,
    secret: c.env.INTERNAL_CONTEXT_SECRET ?? "",
    keyId: c.env.INTERNAL_CONTEXT_KEY_ID ?? "v1",
  });

  c.set("internalHeaders", {
    [INTERNAL_CONTEXT_HEADER]: signed.encoded,
    [INTERNAL_SIGNATURE_HEADER]: signed.signature,
    [INTERNAL_KEY_ID_HEADER]: signed.keyId,
  });

  await next();
};
