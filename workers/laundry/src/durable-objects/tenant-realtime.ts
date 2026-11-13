import type { LaundryBindings } from '../authz';
import type {
  RealtimeNotification,
  RealtimeClientMessage,
} from '../../../../packages/contracts/src/sync';

export interface WebSocketSessionAttachment {
  tenantId: string;
  branchId: string | null;
  userId: string;
  deviceId: string;
  connectedAt: number;
}

export class TenantRealtime {
  private ctx: DurableObjectState;
  private env: LaundryBindings;

  constructor(ctx: DurableObjectState, env: LaundryBindings) {
    this.ctx = ctx;
    this.env = env;

    // Optional: Setup WebSocket hibernation ping-pong auto-response if supported
    try {
      if (typeof this.ctx.setWebSocketAutoResponse === 'function') {
        this.ctx.setWebSocketAutoResponse(
          new WebSocketRequestResponsePair('{"type":"PING"}', '{"type":"PONG"}')
        );
      }
    } catch {
      // Ignored if not in full Cloudflare runtime environment
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 1. WebSocket upgrade request
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // 2. Internal broadcast dispatch
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const payload = (await request.json().catch(() => null)) as {
        notification: RealtimeNotification;
        targetBranchId?: string | null;
      } | null;

      if (!payload || !payload.notification) {
        return new Response(JSON.stringify({ error: 'invalid_notification' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const delivered = this.broadcast(payload.notification, payload.targetBranchId);
      return new Response(JSON.stringify({ success: true, delivered }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Internal stats query
    if (url.pathname === '/stats' && request.method === 'GET') {
      const sockets = this.ctx.getWebSockets();
      return new Response(
        JSON.stringify({
          activeConnections: sockets.length,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
  }

  private handleWebSocketUpgrade(request: Request): Response {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId') || 'unknown';
    const branchId = url.searchParams.get('branchId') || null;
    const userId = url.searchParams.get('userId') || 'anonymous';
    const deviceId = url.searchParams.get('deviceId') || 'unknown';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const attachment: WebSocketSessionAttachment = {
      tenantId,
      branchId,
      userId,
      deviceId,
      connectedAt: Date.now(),
    };

    server.serializeAttachment(attachment);

    const tags: string[] = ['tenant:' + tenantId];
    if (branchId) {
      tags.push('branch:' + branchId);
    } else {
      tags.push('branch:all');
    }
    tags.push('device:' + deviceId);

    this.ctx.acceptWebSocket(server, tags);

    try {
      return new Response(null, {
        status: 101,
        webSocket: client,
      } as any);
    } catch {
      // In standard Node/jsdom Response without Cloudflare workerd extensions:
      return new Response(null, {
        status: 200,
        headers: { 'X-WebSocket-Upgrade': 'accepted' },
      });
    }
  }

  /**
   * Broadcasts a notification to matching connected WebSockets.
   * If targetBranchId is provided, delivers to branch-specific sockets and branch:all sockets.
   */
  public broadcast(
    notification: RealtimeNotification,
    targetBranchId?: string | null
  ): number {
    const message = JSON.stringify(notification);
    let sockets: WebSocket[] = [];

    if (targetBranchId) {
      const branchSockets = this.ctx.getWebSockets('branch:' + targetBranchId);
      const allSockets = this.ctx.getWebSockets('branch:all');
      const unique = new Set([...branchSockets, ...allSockets]);
      sockets = Array.from(unique);
    } else {
      sockets = this.ctx.getWebSockets();
    }

    let delivered = 0;
    for (const ws of sockets) {
      try {
        ws.send(message);
        delivered++;
      } catch (err) {
        console.error('Failed to send notification on WebSocket:', err);
      }
    }

    return delivered;
  }

  /**
   * Hibernation API: Called when a message arrives from a WebSocket.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const rawText = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const data = JSON.parse(rawText) as RealtimeClientMessage;

      if (data.type === 'PING') {
        const response: RealtimeNotification = {
          type: 'PONG',
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(response));
      }
    } catch {
      // Ignore malformed client frames
    }
  }

  /**
   * Hibernation API: Called when a WebSocket is closed by either peer.
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Sockets may already be closed
    }
  }

  /**
   * Hibernation API: Called on connection errors.
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket connection error in TenantRealtime:', error);
    try {
      ws.close(1011, 'Internal WebSocket Error');
    } catch {
      // Ignore
    }
  }
}
