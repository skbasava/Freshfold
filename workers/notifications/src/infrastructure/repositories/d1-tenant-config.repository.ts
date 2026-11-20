import type { TenantNotificationConfig } from "../../domain/entities/tenant-config.entity";
import type { ITenantConfigRepository } from "../../domain/interfaces/tenant-config.repository.interface";

interface CachedEntry {
  config: TenantNotificationConfig;
  expiresAt: number;
}

export class D1TenantConfigRepository implements ITenantConfigRepository {
  private readonly cache = new Map<number, CachedEntry>();
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly db: D1Database,
    private readonly defaultPlatformConfig?: TenantNotificationConfig,
  ) {}

  async getTenantConfig(tenantId: number): Promise<TenantNotificationConfig | null> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > now) {
      return cached.config;
    }

    try {
      const row = await this.db
        .prepare(
          `SELECT * FROM tenant_notification_configs WHERE tenant_id = ? AND is_active = 1 LIMIT 1`,
        )
        .bind(tenantId)
        .first<any>();

      if (row) {
        const config: TenantNotificationConfig = {
          tenantId: row.tenant_id,
          tenantCode: row.tenant_code || undefined,
          email: row.email_config_json ? JSON.parse(row.email_config_json) : undefined,
          whatsapp: row.whatsapp_config_json ? JSON.parse(row.whatsapp_config_json) : undefined,
          sms: row.sms_config_json ? JSON.parse(row.sms_config_json) : undefined,
          push: row.push_config_json ? JSON.parse(row.push_config_json) : undefined,
          isDefaultPlatformConfig: false,
          updatedAtIso: row.updated_at,
        };

        this.cache.set(tenantId, { config, expiresAt: now + this.cacheTtlMs });
        return config;
      }
    } catch (err) {
      console.warn(`[D1TenantConfigRepository] Error fetching config for tenant ${tenantId}:`, err);
    }

    // Fall back to platform default if tenant has no custom configuration in D1
    if (this.defaultPlatformConfig) {
      const fallback: TenantNotificationConfig = {
        ...this.defaultPlatformConfig,
        tenantId,
        isDefaultPlatformConfig: true,
      };
      this.cache.set(tenantId, { config: fallback, expiresAt: now + this.cacheTtlMs });
      return fallback;
    }

    return null;
  }

  async saveTenantConfig(
    config: TenantNotificationConfig,
  ): Promise<TenantNotificationConfig> {
    const nowIso = new Date().toISOString();
    const emailJson = config.email ? JSON.stringify(config.email) : null;
    const whatsappJson = config.whatsapp ? JSON.stringify(config.whatsapp) : null;
    const smsJson = config.sms ? JSON.stringify(config.sms) : null;
    const pushJson = config.push ? JSON.stringify(config.push) : null;

    await this.db
      .prepare(
        `INSERT INTO tenant_notification_configs (
          tenant_id, tenant_code, email_provider, email_config_json,
          whatsapp_provider, whatsapp_config_json, sms_provider, sms_config_json,
          push_provider, push_config_json, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET
          tenant_code = excluded.tenant_code,
          email_provider = excluded.email_provider,
          email_config_json = excluded.email_config_json,
          whatsapp_provider = excluded.whatsapp_provider,
          whatsapp_config_json = excluded.whatsapp_config_json,
          sms_provider = excluded.sms_provider,
          sms_config_json = excluded.sms_config_json,
          push_provider = excluded.push_provider,
          push_config_json = excluded.push_config_json,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at`,
      )
      .bind(
        config.tenantId,
        config.tenantCode || null,
        config.email?.provider || null,
        emailJson,
        config.whatsapp?.provider || null,
        whatsappJson,
        config.sms?.provider || "generic_http",
        smsJson,
        config.push?.provider || "web_push",
        pushJson,
        nowIso,
        nowIso,
      )
      .run();

    const saved: TenantNotificationConfig = {
      ...config,
      updatedAtIso: nowIso,
      isDefaultPlatformConfig: false,
    };

    this.cache.set(config.tenantId, {
      config: saved,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return saved;
  }
}
