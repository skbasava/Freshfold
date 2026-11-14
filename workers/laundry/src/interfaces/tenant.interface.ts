import type {
  DefaultHubProvisionInput,
  Tenant,
  TenantListResponse,
  TenantStatus,
  UpdateTenantRequest,
} from "../../../../packages/contracts/src/tenants";
import type { Cursor } from "../pagination";

export interface ITenantRepository {
  create(
    tenant: Tenant,
    defaultHub?: DefaultHubProvisionInput,
  ): Promise<{ tenant: Tenant; defaultHubId?: string }>;
  getById(id: string, includeDeleted?: boolean): Promise<Tenant | null>;
  getBySlug(slug: string, includeDeleted?: boolean): Promise<Tenant | null>;
  list(options: {
    limit: number;
    cursor: Cursor | null;
    status?: TenantStatus;
    includeDeleted?: boolean;
  }): Promise<TenantListResponse>;
  update(
    id: string,
    updates: UpdateTenantRequest,
    options?: { baseVersion?: number; now?: number },
  ): Promise<Tenant | null>;
  softDelete(id: string, now?: number): Promise<boolean>;
}

