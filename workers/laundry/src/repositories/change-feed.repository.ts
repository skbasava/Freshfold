import type {
  ChangeFeedQuery,
  ChangeFeedResponse,
} from "../../../../packages/contracts/src/changes";
import type { Logger } from "../../../../packages/shared/src/observability";
import type { IChangeFeedRepository } from "../interfaces/change-feed.interface";
import { listChanges } from "../sync/changes";

export class ChangeFeedRepository implements IChangeFeedRepository {
  constructor(
    private readonly db: D1Database,
    private readonly logger?: Logger,
  ) {}

  async list(hubId: string, query: ChangeFeedQuery): Promise<ChangeFeedResponse> {
    const start = Date.now();
    this.logger?.debug("change_feed_repo_list_started", {
      hubId,
      since: query.since,
      limit: query.limit,
    });

    const result = await listChanges(this.db, hubId, query);

    this.logger?.debug("change_feed_repo_list_completed", {
      hubId,
      count: result.changes.length,
      hasMore: result.hasMore,
      durationMs: Date.now() - start,
    });

    return result;
  }
}

