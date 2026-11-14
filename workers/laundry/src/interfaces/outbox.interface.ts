import type {
  FailedOutboxListResponse,
  OutboxHealthResponse,
  OutboxQueueMessage,
  OutboxSweepRequest,
  OutboxSweepResponse,
} from "../../../../packages/contracts/src/queue-messages";

export interface IOutboxRepository {
  getHealth(now: number): Promise<OutboxHealthResponse>;
  listFailed(limit: number): Promise<FailedOutboxListResponse>;
  replayFailed(outboxId: string, now: number): Promise<boolean>;
  dispatchBatch(
    queues: {
      CALENDAR_QUEUE?: Queue<OutboxQueueMessage>;
      NOTIFY_QUEUE?: Queue<OutboxQueueMessage>;
    },
    options: OutboxSweepRequest,
  ): Promise<OutboxSweepResponse>;
}

export interface IOutboxService {
  getHealth(now: number): Promise<OutboxHealthResponse>;
  listFailed(limit: number): Promise<FailedOutboxListResponse>;
  replayFailed(outboxId: string, now: number): Promise<boolean>;
  sweep(
    queues: {
      CALENDAR_QUEUE?: Queue<OutboxQueueMessage>;
      NOTIFY_QUEUE?: Queue<OutboxQueueMessage>;
    },
    options: OutboxSweepRequest,
  ): Promise<OutboxSweepResponse>;
}

