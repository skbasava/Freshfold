import { Hono } from 'hono';
import type { LaundryEnv } from '../authz';
import { requireActor, requirePermission } from '../authz';
import {
  createLogger,
  OBSERVABILITY_EVENTS,
  readLogLevelFromEnv,
} from '../../../../packages/shared/src/observability';
import {
  syncPushRequestSchema,
  syncPullQuerySchema,
  registerDeviceRequestSchema,
  syncResolveRequestSchema,
} from '../../../../packages/contracts/src/sync';
import {
  handleSyncPush,
  handleSyncPull,
  handleSyncStatus,
  handleSyncPolicy,
  handleRegisterDevice,
  handleSyncResolve,
} from './engine';
import { broadcastToTenant } from '../durable-objects/broadcast';

const syncRoutes = new Hono<LaundryEnv>();

// 1. POST /api/sync/push
syncRoutes.post(
  '/push',
  requireActor,
  requirePermission('create_order'),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: 'database_unavailable' }, 503);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = syncPushRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_request',
          details: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        400
      );
    }

    const actor = c.get('actor');
    const result = await handleSyncPush(db, actor, parsed.data.operations);

    const syncLogger = createLogger({
      service: 'laundry',
      ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
      requestId: c.get('requestId'),
      ...readLogLevelFromEnv(c.env),
    });
    syncLogger.info('sync_push_completed', {
      operationsCount: parsed.data.operations.length,
      acknowledgedCount: result.acknowledged.length,
      conflictsCount: result.conflicts.length,
      errorsCount: result.errors.length,
      hubId: actor.hubId,
    });

    // Notify connected realtime clients if mutations were committed
    if (c.env.TENANT_REALTIME && result.acknowledged.length > 0) {
      try {
        c.executionCtx.waitUntil(
          broadcastToTenant(c.env, actor.tenantId, {
            type: 'CHANGES_AVAILABLE',
            tenantId: actor.tenantId,
            branchId: actor.hubId ?? null,
            latestCursor: Date.now(),
            timestamp: Date.now(),
          })
        );
      } catch {
        // Ignored if executionCtx is not present in local test environments
      }
    }

    return c.json(result);
  }
);

// 2. GET /api/sync/pull
syncRoutes.get(
  '/pull',
  requireActor,
  requirePermission('view_orders'),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: 'database_unavailable' }, 503);
    }

    const parsedQuery = syncPullQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json(
        {
          error: 'invalid_request',
          details: parsedQuery.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        400
      );
    }

    const actor = c.get('actor');
    const result = await handleSyncPull(db, actor, parsedQuery.data);

    const pullLogger = createLogger({
      service: 'laundry',
      ...(c.env.ENVIRONMENT ? { environment: c.env.ENVIRONMENT } : {}),
      requestId: c.get('requestId'),
      ...readLogLevelFromEnv(c.env),
    });
    pullLogger.debug(OBSERVABILITY_EVENTS.syncFeedPolled, {
      cursor: parsedQuery.data.cursor,
      changesCount: result.changes.length,
      hubId: actor.hubId,
    });

    return c.json(result);
  }
);

// 3. GET /api/sync/status
syncRoutes.get(
  '/status',
  requireActor,
  requirePermission('view_orders'),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: 'database_unavailable' }, 503);
    }

    const actor = c.get('actor');
    const result = await handleSyncStatus(db, actor);
    return c.json(result);
  }
);

// 4. GET /api/sync/policy
syncRoutes.get(
  '/policy',
  requireActor,
  requirePermission('view_orders'),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: 'database_unavailable' }, 503);
    }

    const actor = c.get('actor');
    const result = await handleSyncPolicy(db, actor);
    return c.json(result);
  }
);

// 5. POST /api/sync/register-device
syncRoutes.post(
  '/register-device',
  requireActor,
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: 'database_unavailable' }, 503);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = registerDeviceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_request',
          details: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        400
      );
    }

    const actor = c.get('actor');
    const result = await handleRegisterDevice(db, actor, parsed.data);
    return c.json(result);
  }
);

// 6. POST /api/sync/resolve
syncRoutes.post(
  '/resolve',
  requireActor,
  requirePermission('create_order'),
  async (c) => {
    const db = c.env.LAUNDRY_DB;
    if (!db) {
      return c.json({ error: 'database_unavailable' }, 503);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = syncResolveRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: 'invalid_request',
          details: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        400
      );
    }

    const actor = c.get('actor');
    const result = await handleSyncResolve(db, actor, parsed.data);
    return c.json(result);
  }
);

// 7. ALL /api/sync/realtime (WebSocket upgrade or client event dispatch)
syncRoutes.all('/realtime', requireActor, async (c) => {
  const doNamespace = c.env.TENANT_REALTIME;
  if (!doNamespace) {
    return c.json({ error: 'realtime_unavailable' }, 503);
  }

  const actor = c.get('actor');
  const id = doNamespace.idFromName(actor.tenantId);
  const stub = doNamespace.get(id);

  const url = new URL(c.req.url);
  url.searchParams.set('tenantId', actor.tenantId);
  if (actor.hubId) url.searchParams.set('branchId', actor.hubId);
  url.searchParams.set('userId', actor.actorId);

  const forwardRequest = new Request(url.toString(), c.req.raw);
  return stub.fetch(forwardRequest);
});

export default syncRoutes;

