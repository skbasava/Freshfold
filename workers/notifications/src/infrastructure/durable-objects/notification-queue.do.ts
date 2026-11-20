import { DurableObject } from "cloudflare:workers";
import type {
  NotificationDispatchResult,
  OutboundNotificationMessage,
} from "../../domain/entities/notification.entity";
import type { INotificationService } from "../../domain/interfaces/notification-service.interface";

export interface QueueItem {
  id: string;
  message: OutboundNotificationMessage;
  enqueuedAtIso: string;
  attempts: number;
  priority: "high" | "normal";
}

export interface QueueStats {
  pendingCount: number;
  processedCount: number;
  failedCount: number;
}

export interface IDurableStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  setAlarm?(scheduledTime: number | Date): Promise<void>;
}

export class NotificationQueueManager {
  private queue: QueueItem[] = [];
  private processedCount = 0;
  private failedCount = 0;
  private isDraining = false;
  private idempotencyCache = new Map<string, NotificationDispatchResult>();
  private notificationService: INotificationService | null = null;
  private storage: IDurableStorageLike;

  constructor(storage: IDurableStorageLike) {
    this.storage = storage;
  }

  async init(): Promise<void> {
    const storedQueue = await this.storage.get<QueueItem[]>("queue");
    if (storedQueue) {
      this.queue = storedQueue;
    }
    const storedStats = await this.storage.get<QueueStats>("stats");
    if (storedStats) {
      this.processedCount = storedStats.processedCount;
      this.failedCount = storedStats.failedCount;
    }
  }

  setNotificationService(service: INotificationService): void {
    this.notificationService = service;
  }

  async handleFetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/enqueue") {
      const message = (await request.json()) as OutboundNotificationMessage;
      const result = await this.enqueue(message);
      return Response.json(result);
    }

    if (request.method === "GET" && url.pathname === "/stats") {
      const stats = await this.getStats();
      return Response.json(stats);
    }

    if (request.method === "POST" && url.pathname === "/drain") {
      const processed = await this.drain();
      return Response.json({ drainedCount: processed });
    }

    return new Response("Not Found", { status: 404 });
  }

  async enqueue(
    message: OutboundNotificationMessage,
  ): Promise<{ status: "queued" | "deduplicated"; id: string; position: number; result?: NotificationDispatchResult }> {
    // 1. Idempotency Check
    if (message.idempotencyKey) {
      const cached = this.idempotencyCache.get(message.idempotencyKey);
      if (cached) {
        return {
          status: "deduplicated",
          id: message.id || "idempotent",
          position: 0,
          result: cached,
        };
      }
    }

    const id = message.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const priority =
      (message.metadata?.priority as "high" | "normal") ||
      (message.channel === "sms" && message.body.toLowerCase().includes("code") ? "high" : "normal");

    const item: QueueItem = {
      id,
      message: { ...message, id },
      enqueuedAtIso: new Date().toISOString(),
      attempts: 0,
      priority,
    };

    if (priority === "high") {
      // High priority items jump to front of queue
      this.queue.unshift(item);
    } else {
      this.queue.push(item);
    }

    const position = this.queue.length;

    await this.persistState();

    // Trigger immediate drain or set alarm
    if (!this.isDraining) {
      this.drain().catch((err) => console.error("Error in automatic queue drain:", err));
    } else if (this.storage.setAlarm) {
      await this.storage.setAlarm(Date.now() + 500);
    }

    return {
      status: "queued",
      id,
      position,
    };
  }

  async drain(): Promise<number> {
    if (this.isDraining || this.queue.length === 0 || !this.notificationService) {
      return 0;
    }

    this.isDraining = true;
    let processedThisBatch = 0;

    try {
      // Process batch of up to 10 items
      const batchSize = Math.min(10, this.queue.length);
      const batch = this.queue.splice(0, batchSize);

      for (const item of batch) {
        try {
          item.attempts += 1;
          const result = await this.notificationService.send(item.message);

          if (result.success) {
            this.processedCount += 1;
            processedThisBatch += 1;
            if (item.message.idempotencyKey) {
              this.idempotencyCache.set(item.message.idempotencyKey, result);
            }
          } else {
            // If failed and attempts < 3, requeue with backoff
            if (item.attempts < 3) {
              this.queue.push(item);
            } else {
              this.failedCount += 1;
            }
          }
        } catch (dispatchErr) {
          console.error(`Failed to dispatch queued notification ${item.id}:`, dispatchErr);
          if (item.attempts < 3) {
            this.queue.push(item);
          } else {
            this.failedCount += 1;
          }
        }
      }

      await this.persistState();
    } finally {
      this.isDraining = false;
    }

    // If more items remain, schedule alarm to continue draining
    if (this.queue.length > 0 && this.storage.setAlarm) {
      await this.storage.setAlarm(Date.now() + 1000);
    }

    return processedThisBatch;
  }

  async alarm(): Promise<void> {
    await this.drain();
  }

  async getStats(): Promise<QueueStats> {
    return {
      pendingCount: this.queue.length,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
    };
  }

  private async persistState(): Promise<void> {
    await this.storage.put("queue", this.queue);
    await this.storage.put("stats", {
      processedCount: this.processedCount,
      failedCount: this.failedCount,
    });
  }
}

export class NotificationQueueDurableObject extends DurableObject {
  private manager: NotificationQueueManager;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.manager = new NotificationQueueManager(this.ctx.storage);
    this.ctx.blockConcurrencyWhile(async () => {
      await this.manager.init();
    });
  }

  setNotificationService(service: INotificationService): void {
    this.manager.setNotificationService(service);
  }

  async fetch(request: Request): Promise<Response> {
    return this.manager.handleFetch(request);
  }

  async enqueue(message: OutboundNotificationMessage) {
    return this.manager.enqueue(message);
  }

  async drain(): Promise<number> {
    return this.manager.drain();
  }

  async alarm(): Promise<void> {
    return this.manager.alarm();
  }

  async getStats(): Promise<QueueStats> {
    return this.manager.getStats();
  }
}
