import type {
  ChangeFeedQuery,
  ChangeFeedResponse,
} from "../../../../packages/contracts/src/changes";

export interface IChangeFeedRepository {
  list(hubId: string, query: ChangeFeedQuery): Promise<ChangeFeedResponse>;
}

export interface IChangeFeedService {
  getChanges(hubId: string, query: ChangeFeedQuery): Promise<ChangeFeedResponse>;
}

