import { Hono } from "hono";
import { NotificationService } from "../application/services/notification.service";
import { TenantConfigService } from "../application/services/tenant-config.service";
import type { INotificationLedgerRepository } from "../domain/interfaces/notification-ledger.repository.interface";
import type { ITenantConfigRepository } from "../domain/interfaces/tenant-config.repository.interface";
import { BrevoEmailAdapter } from "../infrastructure/adapters/email/brevo.adapter";
import { ResendEmailAdapter } from "../infrastructure/adapters/email/resend.adapter";
import { WebPushAdapter } from "../infrastructure/adapters/push/web-push.adapter";
import { GenericHttpSmsAdapter } from "../infrastructure/adapters/sms/generic-http-sms.adapter";
import { OpenWaAdapter } from "../infrastructure/adapters/whatsapp/openwa.adapter";
import { WhatsAppCloudAdapter } from "../infrastructure/adapters/whatsapp/whatsapp-cloud.adapter";
import { D1NotificationLedgerRepository } from "../infrastructure/repositories/d1-notification-ledger.repository";
import { D1TenantConfigRepository } from "../infrastructure/repositories/d1-tenant-config.repository";
import { InMemoryTenantConfigRepository } from "../infrastructure/repositories/in-memory-tenant-config.repository";
import { NotificationHandler } from "./handlers/notification.handler";
import { TenantConfigHandler } from "./handlers/tenant-config.handler";
import { serviceAuthMiddleware } from "./middlewares/auth.middleware";
import { errorHandler } from "./middlewares/error.middleware";
import { tenantMiddleware } from "./middlewares/tenant.middleware";
import { createApiRouter } from "./routers";

export interface NotificationsAppOptions {
  db?: D1Database;
  tenantConfigRepo?: ITenantConfigRepository;
  ledgerRepo?: INotificationLedgerRepository;
  queueNamespace?: any;
  fetchFn?: typeof fetch;
}

export function createNotificationsApp(options: NotificationsAppOptions = {}): Hono<any> {
  const fetchFn = options.fetchFn || fetch;

  // 1. Infrastructure Adapters
  const emailAdapters = {
    brevo: new BrevoEmailAdapter(fetchFn),
    resend: new ResendEmailAdapter(fetchFn),
  };

  const whatsappAdapters = {
    openwa: new OpenWaAdapter(fetchFn),
    whatsapp_cloud: new WhatsAppCloudAdapter(fetchFn),
  };

  const smsAdapters = {
    generic_http: new GenericHttpSmsAdapter(fetchFn),
  };

  const pushAdapters = {
    web_push: new WebPushAdapter(fetchFn),
  };

  // 2. Default Platform Configuration Fallback
  const defaultPlatformConfig = {
    tenantId: 1,
    tenantCode: "TENANT-001",
    email: {
      provider: "brevo" as const,
      apiKey: "brevo_platform_default_key",
      senderEmail: "notifications@freshfold.in",
      senderName: "FreshFold Laundry",
    },
    whatsapp: {
      provider: "openwa" as const,
      openwaBaseUrl: "https://openwa.internal.freshfold.local",
      openwaApiKey: "openwa_platform_key",
      openwaSessionName: "freshfold-main",
    },
    sms: {
      provider: "generic_http" as const,
      endpointUrl: "https://api.sms-gateway.in/v1/send",
      httpMethod: "POST" as const,
      apiKey: "sms_platform_key",
      senderId: "FRSHFD",
    },
    updatedAtIso: new Date().toISOString(),
  };

  // 3. D1 or In-Memory Persistence Selection
  const tenantConfigRepo =
    options.tenantConfigRepo ||
    (options.db
      ? new D1TenantConfigRepository(options.db, defaultPlatformConfig)
      : new InMemoryTenantConfigRepository(defaultPlatformConfig));

  const ledgerRepo =
    options.ledgerRepo || (options.db ? new D1NotificationLedgerRepository(options.db) : undefined);

  // 4. Application Services
  const notificationService = new NotificationService(
    tenantConfigRepo,
    {
      emailAdapters,
      whatsappAdapters,
      smsAdapters,
      pushAdapters,
    },
    ledgerRepo,
  );

  const tenantConfigService = new TenantConfigService(tenantConfigRepo);

  // 5. Presentation Handlers
  const notificationHandler = new NotificationHandler(
    notificationService,
    options.queueNamespace,
  );
  const tenantConfigHandler = new TenantConfigHandler(tenantConfigService);

  // 6. Hono App Assembly
  const app = new Hono<any>();

  app.onError(errorHandler);
  app.use("*", serviceAuthMiddleware);
  app.use("*", tenantMiddleware);

  // Dynamic D1 & Durable Object injection per request if runtime bindings are present
  app.use("*", async (c, next) => {
    if (c.env?.DB && !options.db && !options.tenantConfigRepo) {
      const d1Repo = new D1TenantConfigRepository(c.env.DB, defaultPlatformConfig);
      const d1Ledger = new D1NotificationLedgerRepository(c.env.DB);
      const dynamicService = new NotificationService(
        d1Repo,
        { emailAdapters, whatsappAdapters, smsAdapters, pushAdapters },
        d1Ledger,
      );
      c.set("dynamicService" as any, dynamicService);
    }
    await next();
  });

  const apiRouter = createApiRouter({
    notificationHandler,
    tenantConfigHandler,
  });

  app.route("/", apiRouter);

  return app;
}
