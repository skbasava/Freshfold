import { useState, useEffect, useRef } from 'react';
import type { SyncEngine } from '../sync/sync-engine';
import type { RealtimeNotification } from '../../../packages/contracts/src/sync';
import { syncEvents } from '../sync/sync-events';

export interface UseRealtimeOptions {
  tenantId: string;
  userId?: string;
  deviceId?: string;
  branchId?: string;
  syncEngine?: SyncEngine;
  url?: string;
  enabled?: boolean;
}

export interface UseRealtimeReturn {
  isConnected: boolean;
  lastEventAt: number | null;
}

export function useRealtime({
  tenantId,
  userId = 'anonymous',
  deviceId = 'web-client',
  branchId,
  syncEngine,
  url,
  enabled = true,
}: UseRealtimeOptions): UseRealtimeReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return;
    }

    let isMounted = true;

    function connect() {
      if (!isMounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const defaultHost = window.location.host;
      const baseUrl = url ?? `${protocol}//${defaultHost}/api/realtime`;

      const wsUrl = new URL(baseUrl);
      wsUrl.searchParams.set('tenantId', tenantId);
      wsUrl.searchParams.set('userId', userId);
      wsUrl.searchParams.set('deviceId', deviceId);
      if (branchId) {
        wsUrl.searchParams.set('branchId', branchId);
      }

      try {
        const socket = new WebSocket(wsUrl.toString());
        socketRef.current = socket;

        socket.onopen = () => {
          if (!isMounted) return;
          setIsConnected(true);
          retryCountRef.current = 0;

          // Start 30s heartbeat
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'PING' }));
            }
          }, 30_000);
        };

        socket.onmessage = (event) => {
          if (!isMounted) return;
          setLastEventAt(Date.now());

          try {
            const data = JSON.parse(event.data) as RealtimeNotification;

            if (data.type === 'CHANGES_AVAILABLE') {
              // Notification delivers metadata only! Trigger authoritative pull from D1:
              if (syncEngine) {
                syncEngine.sync().catch((err) =>
                  console.error('Sync triggered by real-time notification failed:', err)
                );
              }
            } else if (data.type === 'DEVICE_REVOKED') {
              // Device revoked: purge local IndexedDB storage
              if (syncEngine) {
                syncEngine.cleanupOnLogout({ wipeAll: true });
              }
            }
          } catch {
            // Ignore unparsed frames
          }
        };

        socket.onclose = () => {
          if (!isMounted) return;
          setIsConnected(false);
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
          }

          // Exponential backoff reconnect
          const backoff = Math.min(1000 * Math.pow(2, retryCountRef.current), 30_000);
          retryCountRef.current++;
          reconnectTimeoutRef.current = setTimeout(connect, backoff);
        };

        socket.onerror = () => {
          try {
            socket.close();
          } catch {
            // Ignore
          }
        };
      } catch (err) {
        console.error('Failed to instantiate WebSocket connection:', err);
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          // Ignore
        }
      }
    };
  }, [enabled, tenantId, userId, deviceId, branchId, syncEngine, url]);

  return { isConnected, lastEventAt };
}

