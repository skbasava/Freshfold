import type { TenantNotificationConfig } from "../../domain/entities/tenant-config.entity";
import type { ITenantConfigRepository } from "../../domain/interfaces/tenant-config.repository.interface";

export class TenantConfigService {
  constructor(private readonly repo: ITenantConfigRepository) {}

  async getConfig(tenantId: number): Promise<TenantNotificationConfig | null> {
    return this.repo.getTenantConfig(tenantId);
  }

  async updateConfig(
    config: TenantNotificationConfig,
  ): Promise<TenantNotificationConfig> {
    if (!config.tenantId || config.tenantId <= 0) {
      throw new Error("Invalid tenantId provided for notification configuration");
    }
    return this.repo.saveTenantConfig(config);
  }
}
