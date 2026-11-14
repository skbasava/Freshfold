import type {
  CreateHubRequest,
  Hub,
  HubListResponse,
  UpdateHubRequest,
} from "../../../../packages/contracts/src/hubs";
import type { Logger } from "../../../../packages/shared/src/observability";
import type { IHubRepository } from "../interfaces/hub.interface";
import type { Cursor } from "../pagination";

export type HubErrorCode =
  | "HUB_NOT_FOUND"
  | "CODE_ALREADY_EXISTS"
  | "VERSION_CONFLICT"
  | "INVALID_REQUEST"
  | "TENANT_NOT_FOUND";

export class HubServiceError extends Error {
  constructor(
    readonly code: HubErrorCode,
    readonly status: 400 | 404 | 409 | 422,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "HubServiceError";
  }
}

export class HubService {
  constructor(
    private readonly repo: IHubRepository,
    private readonly logger?: Logger,
  ) {}

  async createHub(
    tenantId: string,
    input: CreateHubRequest,
    options: { now?: number } = {},
  ): Promise<Hub> {
    const now = options.now ?? Date.now();
    const code = input.code.toUpperCase().trim();

    const existingCode = await this.repo.getByCode(tenantId, code);
    if (existingCode) {
      throw new HubServiceError(
        "CODE_ALREADY_EXISTS",
        409,
        `Hub code '${code}' already exists for this tenant`,
      );
    }

    const hubId = `hub_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    const newHub: Hub = {
      id: hubId,
      tenantId,
      name: input.name.trim(),
      code,
      address: input.address ?? null,
      phone: input.phone ?? null,
      timezone: input.timezone ?? "Asia/Kolkata",
      isActive: input.isActive ?? true,
      settings: input.settings ?? {},
      metadata: input.metadata ?? {},
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    return this.repo.create(newHub);
  }

  async getHub(id: string): Promise<Hub> {
    const hub = await this.repo.getById(id);
    if (!hub) {
      throw new HubServiceError("HUB_NOT_FOUND", 404, "Hub not found");
    }
    return hub;
  }

  async listHubs(options: {
    tenantId?: string;
    limit: number;
    cursor: Cursor | null;
    isActive?: boolean;
  }): Promise<HubListResponse> {
    return this.repo.list(options);
  }

  async updateHub(
    id: string,
    updates: UpdateHubRequest,
    options: { baseVersion?: number; now?: number } = {},
  ): Promise<Hub> {
    const existing = await this.repo.getById(id);
    if (!existing) {
      throw new HubServiceError("HUB_NOT_FOUND", 404, "Hub not found");
    }

    if (
      options.baseVersion !== undefined &&
      existing.version !== options.baseVersion
    ) {
      throw new HubServiceError("VERSION_CONFLICT", 409, "Hub version conflict");
    }

    if (updates.code && updates.code.toUpperCase() !== existing.code) {
      const codeUpper = updates.code.toUpperCase().trim();
      const conflict = await this.repo.getByCode(existing.tenantId, codeUpper);
      if (conflict && conflict.id !== id) {
        throw new HubServiceError(
          "CODE_ALREADY_EXISTS",
          409,
          `Hub code '${codeUpper}' already exists for this tenant`,
        );
      }
      updates.code = codeUpper;
    }

    const updated = await this.repo.update(id, updates, options);
    if (!updated) {
      throw new HubServiceError(
        "VERSION_CONFLICT",
        409,
        "Failed to update hub due to version conflict or concurrent update",
      );
    }

    return updated;
  }

  async deleteHub(id: string, now = Date.now()): Promise<boolean> {
    const existing = await this.repo.getById(id);
    if (!existing) {
      throw new HubServiceError("HUB_NOT_FOUND", 404, "Hub not found");
    }

    return this.repo.softDelete(id, now);
  }
}

