import type { LaundryBindings } from '../authz';
import type { RealtimeNotification } from '../../../../packages/contracts/src/sync';

export async function broadcastToTenant(
  env: LaundryBindings,
  tenantId: string,
  notification: RealtimeNotification,
  targetBranchId?: string | null
): Promise<number> {
  if (!env.TENANT_REALTIME) {
    return 0;
  }

  try {
    const id = env.TENANT_REALTIME.idFromName(tenantId);
    const stub = env.TENANT_REALTIME.get(id);

    const response = await stub.fetch('http://durable-object/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notification,
        targetBranchId,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as { delivered: number };
      return data.delivered;
    }
  } catch (err) {
    console.error(`Failed to broadcast notification for tenant ${tenantId}:`, err);
  }

  return 0;
}

