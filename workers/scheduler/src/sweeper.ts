import type { SignedContext } from "../../../packages/contracts/src/http";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
} from "../../../packages/contracts/src/http";
import {
  outboxSweepResponseSchema,
  type OutboxSweepResponse,
} from "../../../packages/contracts/src/queue-messages";
import { signInternalContext } from "../../../packages/shared/src/internal-context";

export type SchedulerSweeperEnv = {
  LAUNDRY: Fetcher;
  INTERNAL_CONTEXT_SECRET?: string;
  INTERNAL_CONTEXT_KEY_ID?: string;
};

export async function sweepOutbox(
  env: SchedulerSweeperEnv,
  { now = Date.now(), limit = 50 }: { now?: number; limit?: number } = {},
): Promise<OutboxSweepResponse> {
  const secret = env.INTERNAL_CONTEXT_SECRET;
  if (!secret) {
    throw new Error("internal_context_secret_missing");
  }

  const context = {
    actorId: "system:scheduler",
    actorType: "system",
    role: "service",
    tenantId: "system",
    hubId: "system",
    iat: now,
    exp: now + 60_000,
    nonce: crypto.randomUUID(),
  } satisfies SignedContext;

  const signed = await signInternalContext({
    context,
    secret,
    keyId: env.INTERNAL_CONTEXT_KEY_ID ?? "v1",
  });

  const response = await env.LAUNDRY.fetch(
    "https://laundry.internal/internal/outbox/sweep",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INTERNAL_CONTEXT_HEADER]: signed.encoded,
        [INTERNAL_SIGNATURE_HEADER]: signed.signature,
        [INTERNAL_KEY_ID_HEADER]: signed.keyId,
      },
      body: JSON.stringify({ now, limit }),
    },
  );

  if (!response.ok) {
    throw new Error("outbox_sweep_failed");
  }

  return outboxSweepResponseSchema.parse(await response.json());
}
