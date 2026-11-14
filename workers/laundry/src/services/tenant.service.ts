import type {
  CreateTenantRequest,
  DefaultHubProvisionInput,
  Tenant,
  TenantListResponse,
  TenantStatus,
  UpdateTenantRequest,
} from "../../../../packages/contracts/src/tenants";
import type { Logger } from "../../../../packages/shared/src/observability";
import type { ITenantRepository } from "../interfaces/tenant.interface";
import type { Cursor } from "../pagination";

export type TenantErrorCode =
  | "TENANT_NOT_FOUND"
  | "SLUG_ALREADY_EXISTS"
  | "VERSION_CONFLICT"
  | "INVALID_REQUEST";

export class TenantServiceError extends Error {
  constructor(
    readonly code: TenantErrorCode,
    readonly status: 400 | 404 | 409 | 422,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "TenantServiceError";
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class TenantService {
  constructor(
    private readonly repo: ITenantRepository,
    private readonly logger?: Logger,
  ) {}

  async createTenant(
    input: CreateTenantRequest,
    options: { now?: number } = {},
  ): Promise<{ tenant: Tenant; defaultHubId?: string }> {
    const now = options.now ?? Date.now();
    const slug = (input.slug ? slugify(input.slug) : slugify(input.name)) || "tenant";

    const existing = await this.repo.getBySlug(slug);
    if (existing) {
      throw new TenantServiceError("SLUG_ALREADY_EXISTS", 409, `Slug '${slug}' is already in use`);
    }

    const tenantId = `ten_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    const defaultHub: DefaultHubProvisionInput = input.defaultHub ?? {
      name: `${input.name} - Main`,
      code: "MAIN",
      timezone: (input.settings?.timezone as string) ?? "Asia/Kolkata",
    };

    const newTenant: Tenant = {
      id: tenantId,
      name: input.name,
      slug,
      status: "active",
      planTier: input.planTier ?? "standard",
      settings: input.settings ?? {},
      metadata: input.metadata ?? {},
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    return this.repo.create(newTenant, defaultHub);
  }

  async getTenant(id: string): Promise<Tenant> {
    const tenant = await this.repo.getById(id);
    if (!tenant) {
      throw new TenantServiceError("TENANT_NOT_FOUND", 404, "Tenant not found");
    }
    return tenant;
  }

  async listTenants(options: {
    limit: number;
    cursor: Cursor | null;
    status?: TenantStatus;
  }): Promise<TenantListResponse> {
    return this.repo.list(options);
  }

  async updateTenant(
    id: string,
    updates: UpdateTenantRequest,
    options: { baseVersion?: number; now?: number } = {},
  ): Promise<Tenant> {
    const existing = await this.repo.getById(id);
    if (!existing) {
      throw new TenantServiceError("TENANT_NOT_FOUND", 404, "Tenant not found");
    }

    if (
      options.baseVersion !== undefined &&
      existing.version !== options.baseVersion
    ) {
      throw new TenantServiceError("VERSION_CONFLICT", 409, "Tenant version conflict");
    }

    if (updates.slug && updates.slug !== existing.slug) {
      const slugNormalized = slugify(updates.slug);
      const conflict = await this.repo.getBySlug(slugNormalized);
      if (conflict && conflict.id !== id) {
        throw new TenantServiceError("SLUG_ALREADY_EXISTS", 409, `Slug '${slugNormalized}' is already in use`);
      }
      updates.slug = slugNormalized;
    }

    const updated = await this.repo.update(id, updates, options);
    if (!updated) {
      throw new TenantServiceError("VERSION_CONFLICT", 409, "Failed to update tenant due to version conflict or concurrent update");
    }

    return updated;
  }

  async deleteTenant(id: string, now = Date.now()): Promise<boolean> {
    const existing = await this.repo.getById(id);
    if (!existing) {
      throw new TenantServiceError("TENANT_NOT_FOUND", 404, "Tenant not found");
    }

    return this.repo.softDelete(id, now);
  }
}

