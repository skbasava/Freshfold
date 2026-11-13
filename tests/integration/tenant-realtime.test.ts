import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TenantRealtime } from '../../workers/laundry/src/durable-objects/tenant-realtime';
import type { RealtimeNotification } from '../../packages/contracts/src/sync';

class MockWebSocket {
  public sent: string[] = [];
  public closed = false;
  public closeCode?: number;
  public closeReason?: string;
  private attachment: any = null;

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
  }

  serializeAttachment(value: any) {
    this.attachment = value;
  }

  deserializeAttachment() {
    return this.attachment;
  }
}

class MockDurableObjectState {
  public sockets: { ws: MockWebSocket; tags: string[] }[] = [];

  acceptWebSocket(ws: any, tags: string[] = []) {
    this.sockets.push({ ws, tags });
  }

  getWebSockets(tag?: string): any[] {
    if (!tag) {
      return this.sockets.map((s) => s.ws);
    }
    return this.sockets.filter((s) => s.tags.includes(tag)).map((s) => s.ws);
  }
}

describe('Phase 5: Cloudflare Durable Objects & WebSocket Hibernation API', () => {
  let mockState: MockDurableObjectState;
  let tenantRealtime: TenantRealtime;

  beforeEach(() => {
    mockState = new MockDurableObjectState();

    // Mock WebSocketPair global if not present in Node
    (globalThis as any).WebSocketPair = class {
      0 = new MockWebSocket();
      1 = new MockWebSocket();
    };

    tenantRealtime = new TenantRealtime(mockState as any, {} as any);
  });

  describe('WebSocket Upgrades and Tagging', () => {
    it('accepts incoming WebSocket upgrade and tags by tenant, branch, and device', async () => {
      const request = new Request(
        'http://localhost/api/sync/realtime?tenantId=tenant-1&branchId=branch-blr&userId=user-1&deviceId=device-tab-1',
        {
          headers: {
            Upgrade: 'websocket',
            Connection: 'Upgrade',
          },
        }
      );

      const response = await tenantRealtime.fetch(request);
      expect([101, 200]).toContain(response.status);

      // Verify accepted socket in state
      expect(mockState.sockets.length).toBe(1);
      const registered = mockState.sockets[0];
      expect(registered.tags).toContain('tenant:tenant-1');
      expect(registered.tags).toContain('branch:branch-blr');
      expect(registered.tags).toContain('device:device-tab-1');

      // Verify attachment
      expect(registered.ws.deserializeAttachment()).toEqual({
        tenantId: 'tenant-1',
        branchId: 'branch-blr',
        userId: 'user-1',
        deviceId: 'device-tab-1',
        connectedAt: expect.any(Number),
      });
    });

    it('tags sockets without branchId as branch:all', async () => {
      const request = new Request(
        'http://localhost/api/sync/realtime?tenantId=tenant-1&userId=user-owner&deviceId=device-laptop',
        {
          headers: { Upgrade: 'websocket' },
        }
      );

      await tenantRealtime.fetch(request);
      const registered = mockState.sockets[0];
      expect(registered.tags).toContain('branch:all');
    });
  });

  describe('Real-time Notifications Broadcast', () => {
    it('broadcasts notifications selectively to matching branches and global subscribers', async () => {
      const socketBlr = new MockWebSocket();
      mockState.acceptWebSocket(socketBlr, ['tenant:tenant-1', 'branch:branch-blr']);

      const socketDel = new MockWebSocket();
      mockState.acceptWebSocket(socketDel, ['tenant:tenant-1', 'branch:branch-del']);

      const socketGlobal = new MockWebSocket();
      mockState.acceptWebSocket(socketGlobal, ['tenant:tenant-1', 'branch:all']);

      const notification: RealtimeNotification = {
        type: 'CHANGES_AVAILABLE',
        tenantId: 'tenant-1',
        branchId: 'branch-blr',
        entity: 'order',
        latestCursor: 150,
        timestamp: Date.now(),
      };

      // Broadcast targeting branch-blr
      const deliveredCount = tenantRealtime.broadcast(notification, 'branch-blr');

      expect(deliveredCount).toBe(2); // socketBlr + socketGlobal

      // socketBlr received the notification
      expect(socketBlr.sent.length).toBe(1);
      const msgBlr = JSON.parse(socketBlr.sent[0]);
      expect(msgBlr.type).toBe('CHANGES_AVAILABLE');
      expect(msgBlr.latestCursor).toBe(150);

      // socketGlobal received the notification
      expect(socketGlobal.sent.length).toBe(1);

      // socketDel was NOT notified about branch-blr changes
      expect(socketDel.sent.length).toBe(0);
    });

    it('handles internal HTTP POST /broadcast endpoint', async () => {
      const socket = new MockWebSocket();
      mockState.acceptWebSocket(socket, ['tenant:tenant-1', 'branch:all']);

      const notification: RealtimeNotification = {
        type: 'CHANGES_AVAILABLE',
        tenantId: 'tenant-1',
        latestCursor: 200,
        timestamp: Date.now(),
      };

      const request = new Request('http://durable-object/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification }),
      });

      const response = await tenantRealtime.fetch(request);
      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.success).toBe(true);
      expect(body.delivered).toBe(1);

      expect(socket.sent.length).toBe(1);
    });
  });

  describe('WebSocket Hibernation API Message Handling', () => {
    it('replies PONG to client PING heartbeats', async () => {
      const socket = new MockWebSocket();
      await tenantRealtime.webSocketMessage(
        socket as any,
        JSON.stringify({ type: 'PING' })
      );

      expect(socket.sent.length).toBe(1);
      const reply = JSON.parse(socket.sent[0]);
      expect(reply.type).toBe('PONG');
      expect(reply.timestamp).toBeDefined();
    });

    it('safely closes WebSockets on close event', async () => {
      const socket = new MockWebSocket();
      await tenantRealtime.webSocketClose(socket as any, 1000, 'Normal Closure', true);
      expect(socket.closed).toBe(true);
      expect(socket.closeCode).toBe(1000);
    });
  });
});
