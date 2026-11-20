import type { TenantNotificationConfig } from "../../domain/entities/tenant-config.entity";
import type { ITenantConfigRepository } from "../../domain/interfaces/tenant-config.repository.interface";

export class InMemoryTenantConfigRepository implements ITenantConfigRepository {
  private readonly configs = new Map<number, TenantNotificationConfig>();
  private defaultPlatformConfig: TenantNotificationConfig | null = null;

  constructor(defaultPlatformConfig?: TenantNotificationConfig) {
    if (defaultPlatformConfig) {
      this.defaultPlatformConfig = defaultPlatformConfig;
      this.configs.set(defaultPlatformConfig.tenantId, defaultPlatformConfig);
    }
  }

  setDefaultPlatformConfig(config: TenantNotificationConfig): void {
    this.defaultPlatformConfig = config;
  }

  async getTenantConfig(tenantId: number): Promise<TenantNotificationConfig | null> {
    const existing = this.configs.get(tenantId);
    if (existing) {
      return existing;
    }

    // Return platform default if no custom tenant config is registered
    if (this.defaultPlatformConfig) {
      return {
        ...this.defaultPlatformConfig,
        tenantId,
        isDefaultPlatformConfig: true,
      };
    }

    return null;
  }

  async saveTenantConfig(
    config: TenantNotificationConfig,
  ): Promise<TenantNotificationConfig> {
    const saved = {
      ...config,
      updatedAtIso: new Date().toISOString(),
      isDefaultPlatformConfig: false,
    };
    this.configs.set(config.tenantId, saved);
    return saved;
  }
}
