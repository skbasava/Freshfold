import type {
  SyncPushOperation,
  SyncConflictItem,
  SyncErrorItem,
  SyncPushResponse,
  SyncPullQuery,
  SyncPullResponse,
  SyncChangeItem,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  SyncResolveRequest,
  SyncResolveResponse,
  SyncStatusResponse,
  SyncPolicyResponse,
} from '../../../../packages/contracts/src/sync';
import type { InternalContext } from '../../../../packages/contracts/src/auth';

export async function hashPayload(payload: unknown): Promise<string> {
  const jsonStr = JSON.stringify(payload ?? {});
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(jsonStr)
  );
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface EntityVersionRow {
  version: number;
  [key: string]: unknown;
}

export async function getEntityCurrentState(
  db: D1Database,
  tenantId: string,
  entity: string,
  entityId: string
): Promise<{ version: number; record: Record<string, unknown> } | null> {
  let table = '';
  switch (entity) {
    case 'order':
      table = 'orders';
      break;
    case 'orderItem':
      table = 'order_items';
      break;
    case 'customer':
      table = 'customers';
      break;
    case 'service':
      table = 'services';
      break;
    case 'branch':
      table = 'branches';
      break;
    case 'payment':
      table = 'payments';
      break;
    default:
      return null;
  }

  const row = await db
    .prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
    .bind(entityId, tenantId)
    .first<EntityVersionRow>();

  if (!row) {
    return null;
  }

  return {
    version: row.version ?? 1,
    record: row as unknown as Record<string, unknown>,
  };
}

export async function handleSyncPush(
  db: D1Database,
  actor: InternalContext,
  operations: SyncPushOperation[]
): Promise<SyncPushResponse> {
  const acknowledged: string[] = [];
  const conflicts: SyncConflictItem[] = [];
  const errors: SyncErrorItem[] = [];

  for (const op of operations) {
    try {
      const payloadHash = await hashPayload(op.payload);

      // 1. Idempotency Check against sync_operations
      const existingOp = await db
        .prepare(
          `SELECT status FROM sync_operations WHERE operation_id = ? AND tenant_id = ?`
        )
        .bind(op.operationId, actor.tenantId)
        .first<{ status: string }>();

      if (existingOp && existingOp.status === 'processed') {
        acknowledged.push(op.operationId);
        continue;
      }

      // 2. Optimistic Concurrency & Version Check
      const currentState = await getEntityCurrentState(
        db,
        actor.tenantId,
        op.entity,
        op.entityId
      );

      if (currentState) {
        if (op.action === 'create') {
          // Entity already exists!
          conflicts.push({
            operationId: op.operationId,
            entity: op.entity,
            entityId: op.entityId,
            baseVersion: op.baseVersion,
            serverVersion: currentState.version,
            serverPayload: currentState.record,
            message: `Entity ${op.entity}:${op.entityId} already exists on server`,
          });
          continue;
        }

        if (currentState.version !== op.baseVersion) {
          conflicts.push({
            operationId: op.operationId,
            entity: op.entity,
            entityId: op.entityId,
            baseVersion: op.baseVersion,
            serverVersion: currentState.version,
            serverPayload: currentState.record,
            message: `Version conflict: local baseVersion=${op.baseVersion}, serverVersion=${currentState.version}`,
          });

          // Record conflict in sync_operations
          await db
            .prepare(
              `INSERT OR REPLACE INTO sync_operations (
                operation_id, tenant_id, device_id, entity, entity_id, action,
                payload_hash, base_version, status, error_detail, processed_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'conflict', ?, ?)`
            )
            .bind(
              op.operationId,
              actor.tenantId,
              op.deviceId,
              op.entity,
              op.entityId,
              op.action,
              payloadHash,
              op.baseVersion,
              'Version conflict',
              Date.now()
            )
            .run();

          continue;
        }
      } else {
        if (op.action !== 'create' && op.action !== 'payment') {
          conflicts.push({
            operationId: op.operationId,
            entity: op.entity,
            entityId: op.entityId,
            baseVersion: op.baseVersion,
            serverVersion: 0,
            serverPayload: {},
            message: `Entity ${op.entity}:${op.entityId} not found on server`,
          });
          continue;
        }
      }

      // 3. Prepare Atomic D1 Batch Statements for Mutation + Version + sync_changes + sync_operations
      const now = Date.now();
      const newVersion = (currentState?.version ?? 0) + 1;
      const statements: D1PreparedStatement[] = [];
      const branchId =
        (op.payload.branchId as string) ||
        (currentState?.record?.branch_id as string) ||
        actor.hubId ||
        null;

      // Mutation SQL depending on entity
      if (op.entity === 'customer') {
        if (op.action === 'create') {
          statements.push(
            db
              .prepare(
                `INSERT INTO customers (id, hub_id, tenant_id, branch_id, name, phone, phone_normalized, email, notes, version, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
              )
              .bind(
                op.entityId,
                branchId,
                actor.tenantId,
                branchId,
                op.payload.name,
                op.payload.phone,
                (op.payload.phone as string).replace(/\D/g, ''),
                op.payload.email ?? null,
                op.payload.notes ?? null,
                newVersion,
                now,
                now
              )
          );
        } else if (op.action === 'update') {
          statements.push(
            db
              .prepare(
                `UPDATE customers SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email),
                 notes = COALESCE(?, notes), version = ?, updated_at = ?
                 WHERE id = ? AND tenant_id = ?`
              )
              .bind(
                op.payload.name ?? null,
                op.payload.phone ?? null,
                op.payload.email ?? null,
                op.payload.notes ?? null,
                newVersion,
                now,
                op.entityId,
                actor.tenantId
              )
          );
        } else if (op.action === 'delete') {
          statements.push(
            db
              .prepare(
                `UPDATE customers SET deleted_at = ?, version = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`
              )
              .bind(now, newVersion, now, op.entityId, actor.tenantId)
          );
        }
      } else if (op.entity === 'order') {
        if (op.action === 'create') {
          statements.push(
            db
              .prepare(
                `INSERT INTO orders (
                  id, hub_id, tenant_id, branch_id, customer_id, order_number, status, service_type,
                  payment_status, subtotal_minor, discount_minor, tax_minor, total_minor,
                  notes, received_at, promised_at, delivered_at, version, last_mutation_id,
                  created_at, updated_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
              )
              .bind(
                op.entityId,
                branchId,
                actor.tenantId,
                branchId,
                op.payload.customerId,
                op.payload.orderNumber,
                op.payload.status ?? 'received',
                op.payload.serviceType ?? 'standard',
                op.payload.paymentStatus ?? 'unpaid',
                op.payload.subtotalMinor ?? 0,
                op.payload.discountMinor ?? 0,
                op.payload.taxMinor ?? 0,
                op.payload.totalMinor ?? 0,
                op.payload.notes ?? null,
                op.payload.receivedAt ?? now,
                op.payload.promisedAt ?? null,
                op.payload.deliveredAt ?? null,
                newVersion,
                op.operationId,
                now,
                now
              )
          );
        } else if (op.action === 'status_change') {
          statements.push(
            db
              .prepare(
                `UPDATE orders SET status = ?, delivered_at = COALESCE(?, delivered_at), version = ?,
                 last_mutation_id = ?, updated_at = ?
                 WHERE id = ? AND tenant_id = ?`
              )
              .bind(
                op.payload.newStatus,
                op.payload.deliveredAt ?? null,
                newVersion,
                op.operationId,
                now,
                op.entityId,
                actor.tenantId
              )
          );
        } else if (op.action === 'update') {
          statements.push(
            db
              .prepare(
                `UPDATE orders SET payment_status = COALESCE(?, payment_status), notes = COALESCE(?, notes),
                 version = ?, last_mutation_id = ?, updated_at = ?
                 WHERE id = ? AND tenant_id = ?`
              )
              .bind(
                op.payload.paymentStatus ?? null,
                op.payload.notes ?? null,
                newVersion,
                op.operationId,
                now,
                op.entityId,
                actor.tenantId
              )
          );
        } else if (op.action === 'delete') {
          statements.push(
            db
              .prepare(
                `UPDATE orders SET deleted_at = ?, version = ?, last_mutation_id = ?, updated_at = ?
                 WHERE id = ? AND tenant_id = ?`
              )
              .bind(now, newVersion, op.operationId, now, op.entityId, actor.tenantId)
          );
        }
      } else if (op.entity === 'orderItem') {
        if (op.action === 'create') {
          statements.push(
            db
              .prepare(
                `INSERT INTO order_items (
                  id, hub_id, tenant_id, order_id, service_id, description, quantity,
                  unit_price_minor, line_total_minor, garment_attributes, version,
                  created_at, updated_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
              )
              .bind(
                op.entityId,
                branchId,
                actor.tenantId,
                op.payload.orderId,
                op.payload.serviceId,
                op.payload.description,
                op.payload.quantity,
                op.payload.unitPriceMinor ?? 0,
                op.payload.lineTotalMinor ?? 0,
                op.payload.garmentAttributes ? JSON.stringify(op.payload.garmentAttributes) : null,
                newVersion,
                now,
                now
              )
          );
        } else if (op.action === 'update') {
          statements.push(
            db
              .prepare(
                `UPDATE order_items SET description = COALESCE(?, description), quantity = COALESCE(?, quantity),
                 unit_price_minor = COALESCE(?, unit_price_minor), line_total_minor = COALESCE(?, line_total_minor),
                 version = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`
              )
              .bind(
                op.payload.description ?? null,
                op.payload.quantity ?? null,
                op.payload.unitPriceMinor ?? null,
                op.payload.lineTotalMinor ?? null,
                newVersion,
                now,
                op.entityId,
                actor.tenantId
              )
          );
        } else if (op.action === 'delete') {
          statements.push(
            db
              .prepare(
                `UPDATE order_items SET deleted_at = ?, version = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`
              )
              .bind(now, newVersion, now, op.entityId, actor.tenantId)
          );
        }
      } else if (op.entity === 'service') {
        if (op.action === 'create') {
          statements.push(
            db
              .prepare(
                `INSERT INTO services (
                  id, tenant_id, name, description, pricing_unit, unit_price_minor,
                  is_active, version, created_at, updated_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
              )
              .bind(
                op.entityId,
                actor.tenantId,
                op.payload.name,
                op.payload.description ?? null,
                op.payload.pricingUnit,
                op.payload.unitPriceMinor,
                op.payload.isActive === false ? 0 : 1,
                newVersion,
                now,
                now
              )
          );
        } else if (op.action === 'update') {
          statements.push(
            db
              .prepare(
                `UPDATE services SET name = COALESCE(?, name), description = COALESCE(?, description),
                 pricing_unit = COALESCE(?, pricing_unit), unit_price_minor = COALESCE(?, unit_price_minor),
                 is_active = COALESCE(?, is_active), version = ?, updated_at = ?
                 WHERE id = ? AND tenant_id = ?`
              )
              .bind(
                op.payload.name ?? null,
                op.payload.description ?? null,
                op.payload.pricingUnit ?? null,
                op.payload.unitPriceMinor ?? null,
                op.payload.isActive !== undefined ? (op.payload.isActive ? 1 : 0) : null,
                newVersion,
                now,
                op.entityId,
                actor.tenantId
              )
          );
        }
      } else if (op.entity === 'branch') {
        if (op.action === 'create') {
          statements.push(
            db
              .prepare(
                `INSERT INTO branches (
                  id, tenant_id, name, code, address, is_active, version,
                  created_at, updated_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
              )
              .bind(
                op.entityId,
                actor.tenantId,
                op.payload.name,
                op.payload.code,
                op.payload.address,
                op.payload.isActive === false ? 0 : 1,
                newVersion,
                now,
                now
              )
          );
        }
      } else if (op.entity === 'payment') {
        // Append-only payment record
        statements.push(
          db
            .prepare(
              `INSERT INTO payments (
                id, tenant_id, order_id, amount_minor, method, status,
                provider_reference, idempotency_key, recorded_at, confirmed_at,
                created_at, version
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              op.entityId,
              actor.tenantId,
              op.payload.orderId,
              op.payload.amountMinor,
              op.payload.method,
              op.payload.status ?? 'pending',
              op.payload.providerReference ?? null,
              op.payload.idempotencyKey ?? op.operationId,
              op.payload.recordedAt ?? now,
              op.payload.confirmedAt ?? null,
              now,
              1
            )
        );
      }

      // Change log append
      statements.push(
        db
          .prepare(
            `INSERT INTO sync_changes (
              tenant_id, branch_id, entity, entity_id, version, op, payload_json, changed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            actor.tenantId,
            branchId,
            op.entity,
            op.entityId,
            newVersion,
            op.action === 'delete' ? 'delete' : op.action === 'create' ? 'insert' : 'update',
            JSON.stringify(op.payload),
            now
          )
      );

      // Idempotency receipt in sync_operations
      statements.push(
        db
          .prepare(
            `INSERT OR REPLACE INTO sync_operations (
              operation_id, tenant_id, device_id, entity, entity_id, action,
              payload_hash, base_version, status, error_detail, processed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processed', NULL, ?)`
          )
          .bind(
            op.operationId,
            actor.tenantId,
            op.deviceId,
            op.entity,
            op.entityId,
            op.action,
            payloadHash,
            op.baseVersion,
            now
          )
      );

      // Atomic commit
      await db.batch(statements);
      acknowledged.push(op.operationId);
    } catch (err) {
      errors.push({
        operationId: op.operationId,
        error: err instanceof Error ? err.message : String(err),
        canRetry: true,
      });
    }
  }

  return { acknowledged, conflicts, errors };
}

export async function handleSyncPull(
  db: D1Database,
  actor: InternalContext,
  query: SyncPullQuery
): Promise<SyncPullResponse> {
  let sql = `SELECT cursor, entity, entity_id, branch_id, version, op, payload_json, changed_at
             FROM sync_changes
             WHERE tenant_id = ? AND cursor > ?`;
  const bindings: (string | number)[] = [actor.tenantId, query.cursor];

  if (query.dataset) {
    sql += ` AND entity = ?`;
    bindings.push(query.dataset);
  }

  if (query.branchId) {
    sql += ` AND (branch_id = ? OR branch_id IS NULL)`;
    bindings.push(query.branchId);
  } else if (actor.hubId && actor.role === 'counter_staff') {
    // Restricted counter staff gets branch-scoped replication
    sql += ` AND (branch_id = ? OR branch_id IS NULL)`;
    bindings.push(actor.hubId);
  }

  sql += ` ORDER BY cursor ASC LIMIT ?`;
  bindings.push(query.limit + 1);

  const stmt = db.prepare(sql);
  const result = await stmt.bind(...bindings).all<{
    cursor: number;
    entity: string;
    entity_id: string;
    branch_id: string | null;
    version: number;
    op: 'insert' | 'update' | 'delete';
    payload_json: string;
    changed_at: number;
  }>();

  const rows = result.results;
  const hasMore = rows.length > query.limit;
  const pageRows = rows.slice(0, query.limit);

  const changes: SyncChangeItem[] = pageRows.map((r) => ({
    cursor: r.cursor,
    entity: r.entity as any,
    entityId: r.entity_id,
    branchId: r.branch_id,
    version: r.version,
    op: r.op,
    payload: JSON.parse(r.payload_json || '{}'),
    changedAt: r.changed_at,
  }));

  const nextCursor =
    pageRows.length > 0 ? pageRows[pageRows.length - 1].cursor : query.cursor;

  return { changes, nextCursor, hasMore };
}

export async function handleSyncStatus(
  db: D1Database,
  actor: InternalContext
): Promise<SyncStatusResponse> {
  const maxRow = await db
    .prepare(
      `SELECT COALESCE(MAX(cursor), 0) as latestCursor FROM sync_changes WHERE tenant_id = ?`
    )
    .bind(actor.tenantId)
    .first<{ latestCursor: number }>();

  const deviceCountRow = await db
    .prepare(
      `SELECT COUNT(*) as activeDevices FROM device_registrations WHERE tenant_id = ? AND is_revoked = 0`
    )
    .bind(actor.tenantId)
    .first<{ activeDevices: number }>();

  return {
    status: 'ok',
    tenantId: actor.tenantId,
    latestCursor: maxRow?.latestCursor ?? 0,
    serverTime: Date.now(),
    activeDevices: deviceCountRow?.activeDevices ?? 0,
  };
}

export async function handleSyncPolicy(
  db: D1Database,
  actor: InternalContext
): Promise<SyncPolicyResponse> {
  const rows = await db
    .prepare(
      `SELECT dataset, filter_rule as filterRule, max_history_days as maxHistoryDays
       FROM replication_policies WHERE tenant_id = ? AND role = ?`
    )
    .bind(actor.tenantId, actor.role)
    .all<{ dataset: string; filterRule: string; maxHistoryDays: number | null }>();

  if (rows.results.length > 0) {
    return {
      tenantId: actor.tenantId,
      role: actor.role,
      policies: rows.results,
    };
  }

  // Sensible role-based replication defaults
  return {
    tenantId: actor.tenantId,
    role: actor.role,
    policies: [
      {
        dataset: 'services',
        filterRule: 'active_catalog',
        maxHistoryDays: null,
      },
      {
        dataset: 'branches',
        filterRule: 'tenant_branches',
        maxHistoryDays: null,
      },
      {
        dataset: 'customers',
        filterRule: actor.role === 'owner' ? 'all' : 'assigned_branch',
        maxHistoryDays: 365,
      },
      {
        dataset: 'orders',
        filterRule: actor.role === 'owner' ? 'all' : 'assigned_branch',
        maxHistoryDays: 30,
      },
      {
        dataset: 'payments',
        filterRule: actor.role === 'owner' ? 'all' : 'assigned_branch',
        maxHistoryDays: 30,
      },
    ],
  };
}

export async function handleRegisterDevice(
  db: D1Database,
  actor: InternalContext,
  data: RegisterDeviceRequest
): Promise<RegisterDeviceResponse> {
  const now = Date.now();
  const branchId = data.branchId ?? actor.hubId ?? null;

  await db
    .prepare(
      `INSERT INTO device_registrations (
        id, tenant_id, user_id, branch_id, device_name, platform,
        is_revoked, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        device_name = excluded.device_name,
        platform = excluded.platform,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at`
    )
    .bind(
      data.deviceId,
      actor.tenantId,
      actor.actorId,
      branchId,
      data.deviceName,
      data.platform,
      now,
      now,
      now
    )
    .run();

  return {
    success: true,
    deviceId: data.deviceId,
    registeredAt: now,
  };
}

export async function handleSyncResolve(
  db: D1Database,
  actor: InternalContext,
  data: SyncResolveRequest
): Promise<SyncResolveResponse> {
  const currentState = await getEntityCurrentState(
    db,
    actor.tenantId,
    data.entity,
    data.entityId
  );

  const newVersion = (currentState?.version ?? 0) + 1;
  const now = Date.now();

  if (data.resolution === 'accept_server') {
    return {
      resolved: true,
      entityId: data.entityId,
      newVersion: currentState?.version ?? 1,
    };
  }

  // For keep_local or custom resolution: apply payload and advance version
  const payloadToApply = data.customPayload ?? currentState?.record ?? {};
  let updateSql = '';

  switch (data.entity) {
    case 'order':
      updateSql = `UPDATE orders SET notes = COALESCE(?, notes), status = COALESCE(?, status),
                   version = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`;
      break;
    case 'customer':
      updateSql = `UPDATE customers SET name = COALESCE(?, name), notes = COALESCE(?, notes),
                   version = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`;
      break;
    default:
      updateSql = '';
  }

  if (updateSql) {
    await db.batch([
      db
        .prepare(updateSql)
        .bind(
          payloadToApply.notes ?? null,
          payloadToApply.status ?? payloadToApply.name ?? null,
          newVersion,
          now,
          data.entityId,
          actor.tenantId
        ),
      db
        .prepare(
          `INSERT INTO sync_changes (
            tenant_id, branch_id, entity, entity_id, version, op, payload_json, changed_at
          ) VALUES (?, ?, ?, ?, ?, 'update', ?, ?)`
        )
        .bind(
          actor.tenantId,
          actor.hubId ?? null,
          data.entity,
          data.entityId,
          newVersion,
          JSON.stringify(payloadToApply),
          now
        ),
    ]);
  }

  return {
    resolved: true,
    entityId: data.entityId,
    newVersion,
  };
}
