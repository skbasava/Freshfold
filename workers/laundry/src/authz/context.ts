import type { MiddlewareHandler } from "hono";
import type { InternalContext } from "../../../../packages/contracts/src/auth";
import {
  INTERNAL_CONTEXT_HEADER,
  INTERNAL_KEY_ID_HEADER,
  INTERNAL_SIGNATURE_HEADER,
  SERVICE_HUB_HEADER,
  SERVICE_NAME_HEADER,
  SERVICE_TENANT_HEADER,
  SERVICE_TOKEN_HEADER,
  type SignedContext,
} from "../../../../packages/contracts/src/http";
import {
  createReplayGuard,
  safeEqualStrings,
  verifyInternalContext,
  type ReplayGuard,
} from "../../../../packages/shared/src/internal-context";
import type { OutboxQueueMessage } from "../../../../packages/contracts/src/queue-messages";

export type LaundryBindings = {
  LAUNDRY_DB?: D1Database;
  ENVIRONMENT?: string;
  INTERNAL_CONTEXT_SECRET?: string;
  SERVICE_TOKEN?: string;
  CALENDAR_QUEUE?: Queue<OutboxQueueMessage>;
  NOTIFY_QUEUE?: Queue<OutboxQueueMessage>;
  // Test hook for deterministic business-time evaluation.
  LAUNDRY_CLOCK?: () => number;
};

export type LaundryVariables = {
  actor: InternalContext;
  requestId: string;
};

export type LaundryEnv = {
  Bindings: LaundryBindings;
  Variables: LaundryVariables;
};

type ResolveOptions = {
  now?: number;
  replayGuard?: ReplayGuard;
};

const ALLOWED_SERVICES: ReadonlySet<string> = new Set([
  "calendar",
  "notifications",
  "scheduler",
]);

const replayGuard = createReplayGuard();

export async function resolveActor(
  request: Request,
  env: LaundryBindings,
  options: ResolveOptions = {},
): Promise<InternalContext | null> {
  const encoded = request.headers.get(INTERNAL_CONTEXT_HEADER);
  const signature = request.headers.get(INTERNAL_SIGNATURE_HEADER);
  const keyId = request.headers.get(INTERNAL_KEY_ID_HEADER);
  const serviceToken = request.headers.get(SERVICE_TOKEN_HEADER);
  const serviceName = request.headers.get(SERVICE_NAME_HEADER);

  if (encoded || signature) {
    if (serviceToken) {
      return null;
    }

    if (!env.INTERNAL_CONTEXT_SECRET) {
      return null;
    }

    const verified = await verifyInternalContext({
      encoded,
      signature,
      keyId,
      secret: env.INTERNAL_CONTEXT_SECRET,
      now: options.now,
      replayGuard: options.replayGuard ?? replayGuard,
    });

    return verified.ok ? toActor(verified.context) : null;
  }

  if (!serviceToken) {
    return null;
  }

  if (!serviceName || !ALLOWED_SERVICES.has(serviceName)) {
    return null;
  }

  if (
    !env.SERVICE_TOKEN ||
    !(await safeEqualStrings(serviceToken, env.SERVICE_TOKEN))
  ) {
    return null;
  }

  const tenantId = request.headers.get(SERVICE_TENANT_HEADER);
  const hubId = request.headers.get(SERVICE_HUB_HEADER);
  if (!tenantId || !hubId) {
    return null;
  }

  const now = options.now ?? Date.now();
  const calendar = serviceName === "calendar";

  return {
    actorId: calendar ? "system:calendar" : `service:${serviceName}`,
    actorType: calendar ? "system" : "service",
    role: "service",
    tenantId,
    hubId,
    exp: now + 60_000,
  };
}

export const requireActor: MiddlewareHandler<LaundryEnv> = async (c, next) => {
  const actor = await resolveActor(c.req.raw, c.env);
  if (!actor) {
    return c.json({ error: "unauthorized" }, 401);
  }

  c.set("actor", actor);
  await next();
};

function toActor(context: SignedContext): InternalContext {
  return {
    actorId: context.actorId,
    actorType: context.actorType,
    role: context.role,
    tenantId: context.tenantId,
    hubId: context.hubId,
    exp: context.exp,
  };
}
