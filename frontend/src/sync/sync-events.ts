export type SyncEventType =
  | 'sync:start'
  | 'sync:complete'
  | 'sync:error'
  | 'sync:progress'
  | 'sync:conflict'
  | 'sync:online'
  | 'sync:offline';

export interface SyncProgressPayload {
  phase: 'push' | 'pull';
  dataset?: string;
  processed: number;
  total?: number;
}

export interface SyncConflictEventPayload {
  conflictId: string;
  entity: string;
  entityId: string;
  baseVersion: number;
  serverVersion: number;
}

export type SyncEventHandler<T = unknown> = (payload: T) => void;

class SyncEventEmitter {
  private handlers: Map<SyncEventType, Set<SyncEventHandler<any>>> = new Map();

  public on<T = unknown>(event: SyncEventType, handler: SyncEventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.off(event, handler);
    };
  }

  public off<T = unknown>(event: SyncEventType, handler: SyncEventHandler<T>): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler);
    }
  }

  public emit<T = unknown>(event: SyncEventType, payload?: T): void {
    const set = this.handlers.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Error in sync event handler for ${event}:`, err);
        }
      }
    }
  }

  public removeAllListeners(): void {
    this.handlers.clear();
  }
}

export const syncEvents = new SyncEventEmitter();

