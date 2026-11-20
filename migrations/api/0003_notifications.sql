-- Migration 0003: Production Notifications Architecture (D1 Persistence + Notification Logs)

CREATE TABLE IF NOT EXISTS `tenant_notification_configs` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `tenant_id` INTEGER NOT NULL UNIQUE,
  `tenant_code` TEXT,
  `email_provider` TEXT CHECK(`email_provider` IN ('brevo', 'resend')),
  `email_config_json` TEXT,
  `whatsapp_provider` TEXT CHECK(`whatsapp_provider` IN ('openwa', 'whatsapp_cloud')),
  `whatsapp_config_json` TEXT,
  `sms_provider` TEXT DEFAULT 'generic_http' CHECK(`sms_provider` IN ('generic_http')),
  `sms_config_json` TEXT,
  `push_provider` TEXT DEFAULT 'web_push' CHECK(`push_provider` IN ('web_push')),
  `push_config_json` TEXT,
  `is_active` INTEGER DEFAULT 1 NOT NULL CHECK(`is_active` IN (0, 1)),
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `uq_tenant_notif_config_tenant_id` ON `tenant_notification_configs`(`tenant_id`);
CREATE INDEX IF NOT EXISTS `idx_tenant_notif_config_active` ON `tenant_notification_configs`(`tenant_id`, `is_active`);

CREATE TABLE IF NOT EXISTS `notification_logs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `tenant_id` INTEGER NOT NULL,
  `channel` TEXT NOT NULL CHECK(`channel` IN ('email', 'whatsapp', 'sms', 'push')),
  `provider` TEXT NOT NULL,
  `recipient` TEXT NOT NULL,
  `subject` TEXT,
  `body` TEXT NOT NULL,
  `template_id` TEXT,
  `status` TEXT NOT NULL CHECK(`status` IN ('queued', 'sending', 'sent', 'failed')),
  `provider_message_id` TEXT,
  `error_message` TEXT,
  `retry_count` INTEGER DEFAULT 0 NOT NULL,
  `idempotency_key` TEXT,
  `metadata_json` TEXT,
  `created_at` TEXT NOT NULL,
  `sent_at` TEXT,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_notif_logs_tenant_created` ON `notification_logs`(`tenant_id`, `created_at` DESC);
CREATE INDEX IF NOT EXISTS `idx_notif_logs_status_created` ON `notification_logs`(`status`, `created_at` DESC);
CREATE INDEX IF NOT EXISTS `idx_notif_logs_idempotency` ON `notification_logs`(`tenant_id`, `idempotency_key`);

-- Seed initial default configuration for Tenant 1 (FreshFold India)
INSERT OR IGNORE INTO `tenant_notification_configs` (
  `tenant_id`,
  `tenant_code`,
  `email_provider`,
  `email_config_json`,
  `whatsapp_provider`,
  `whatsapp_config_json`,
  `sms_provider`,
  `sms_config_json`,
  `push_provider`,
  `push_config_json`,
  `is_active`,
  `created_at`,
  `updated_at`
) VALUES (
  1,
  'TENANT-001',
  'brevo',
  '{"provider":"brevo","apiKey":"brevo_default_key","senderEmail":"notifications@freshfold.in","senderName":"FreshFold India"}',
  'openwa',
  '{"provider":"openwa","openwaBaseUrl":"https://openwa.internal.freshfold.local","openwaApiKey":"openwa_default_key","openwaSessionName":"freshfold-main"}',
  'generic_http',
  '{"provider":"generic_http","endpointUrl":"https://api.sms-gateway.in/v1/send","httpMethod":"POST","apiKey":"sms_default_key","senderId":"FRSHFD"}',
  'web_push',
  '{"provider":"web_push"}',
  1,
  datetime('now'),
  datetime('now')
);
