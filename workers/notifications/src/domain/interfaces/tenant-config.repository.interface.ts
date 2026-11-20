import type { TenantNotificationConfig } from "../entities/tenant-config.entity";

export interface ITenantConfigRepository {
  getTenantConfig(tenantId: number): Promise<TenantNotificationConfig | null>;
  saveTenantConfig(config: TenantNotificationConfig): Promise<TenantNotificationConfig>;
}
