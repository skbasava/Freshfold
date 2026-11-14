import type {
  Hub,
  HubListResponse,
  UpdateHubRequest,
} from "../../../../packages/contracts/src/hubs";
import type { Cursor } from "../pagination";

export interface IHubRepository {
  create(hub: Hub): Promise<Hub>;
  getById(id: string, includeDeleted?: boolean): Promise<Hub | null>;
  getByCode(tenantId: string, code: string, includeDeleted?: boolean): Promise<Hub | null>;
  list(options: {
    tenantId?: string;
    limit: number;
    cursor: Cursor | null;
    isActive?: boolean;
    includeDeleted?: boolean;
  }): Promise<HubListResponse>;
  update(
    id: string,
    updates: UpdateHubRequest,
    options?: { baseVersion?: number; now?: number },
  ): Promise<Hub | null>;
  softDelete(id: string, now?: number): Promise<boolean>;
}

