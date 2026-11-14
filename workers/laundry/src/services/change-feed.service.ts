import type {
  ChangeFeedQuery,
  ChangeFeedResponse,
} from "../../../../packages/contracts/src/changes";
import type { Logger } from "../../../../packages/shared/src/observability";
import type {
  IChangeFeedRepository,
  IChangeFeedService,
} from "../interfaces/change-feed.interface";

export class ChangeFeedService implements IChangeFeedService {
  constructor(
    private readonly changeFeedRepo: IChangeFeedRepository,
    private readonly logger?: Logger,
  ) {}

  async getChanges(
    hubId: string,
    query: ChangeFeedQuery,
  ): Promise<ChangeFeedResponse> {
    this.logger?.debug("change_feed_service_get_changes_requested", {
      hubId,
      since: query.since,
      limit: query.limit,
    });

    const result = await this.changeFeedRepo.list(hubId, query);

    this.logger?.info("change_feed_service_get_changes_success", {
      hubId,
      count: result.changes.length,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    });

    return result;
  }
}

