import type {
  FailedOutboxListResponse,
  OutboxHealthResponse,
  OutboxQueueMessage,
  OutboxSweepRequest,
  OutboxSweepResponse,
} from "../../../../packages/contracts/src/queue-messages";
import {
  OBSERVABILITY_EVENTS,
  type Logger,
} from "../../../../packages/shared/src/observability";
import type {
  IOutboxRepository,
  IOutboxService,
} from "../interfaces/outbox.interface";

export class OutboxService implements IOutboxService {
  constructor(
    private readonly outboxRepo: IOutboxRepository,
    private readonly logger?: Logger,
  ) {}

  async getHealth(now: number): Promise<OutboxHealthResponse> {
    this.logger?.debug("outbox_service_get_health_requested", { now });
    return this.outboxRepo.getHealth(now);
  }

  async listFailed(limit: number): Promise<FailedOutboxListResponse> {
    this.logger?.debug("outbox_service_list_failed_requested", { limit });
    return this.outboxRepo.listFailed(limit);
  }

  async replayFailed(outboxId: string, now: number): Promise<boolean> {
    this.logger?.debug("outbox_service_replay_failed_requested", { outboxId, now });
    const replayed = await this.outboxRepo.replayFailed(outboxId, now);
    this.logger?.info("outbox_service_replayed", { outboxId, replayed });
    return replayed;
  }

  async sweep(
    queues: {
      CALENDAR_QUEUE?: Queue<OutboxQueueMessage>;
      NOTIFY_QUEUE?: Queue<OutboxQueueMessage>;
    },
    options: OutboxSweepRequest,
  ): Promise<OutboxSweepResponse> {
    this.logger?.debug("outbox_service_sweep_requested", {
      limit: options.limit,
    });

    const result = await this.outboxRepo.dispatchBatch(queues, options);

    this.logger?.info(OBSERVABILITY_EVENTS.outboxBatchDispatched, {
      claimed: result.claimed,
      sent: result.sent,
      failed: result.failed,
    });

    return result;
  }
}
