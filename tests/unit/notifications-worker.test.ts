import { describe, expect, it, vi } from "vitest";
import { createNotificationsApp } from "../../workers/notifications/src/presentation/app";
import { InMemoryTenantConfigRepository } from "../../workers/notifications/src/infrastructure/repositories/in-memory-tenant-config.repository";
import type { TenantNotificationConfig } from "../../workers/notifications/src/domain/entities/tenant-config.entity";

describe("Notifications Worker — Clean Architecture & Multi-Tenancy", () => {
  it("serves the /health check endpoint", async () => {
    const app = createNotificationsApp();
    const req = new Request("http://localhost/health");
    const res = await app.fetch(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("laundry-notifications");
  });

  it("handles multi-tenant routing: Tenant 1 (Brevo + OpenWA) vs Tenant 2 (Resend + WhatsApp Cloud)", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const urlStr = url.toString();

      // Brevo API
      if (urlStr.includes("api.brevo.com")) {
        const apiKey = (init?.headers as Record<string, string>)?.["api-key"];
        return new Response(JSON.stringify({ messageId: `brevo_msg_${apiKey}` }), { status: 201 });
      }

      // Resend API
      if (urlStr.includes("api.resend.com")) {
        const auth = (init?.headers as Record<string, string>)?.["authorization"];
        return new Response(JSON.stringify({ id: `resend_msg_${auth}` }), { status: 200 });
      }

      // OpenWA API
      if (urlStr.includes("openwa.tenant1.local")) {
        return new Response(JSON.stringify({ id: "openwa_msg_101", response: "true" }), {
          status: 200,
        });
      }

      // Meta WhatsApp Cloud API
      if (urlStr.includes("graph.facebook.com")) {
        return new Response(
          JSON.stringify({ messages: [{ id: "waba_msg_202" }] }),
          { status: 200 },
        );
      }

      return new Response("Not found", { status: 404 });
    });

    const repo = new InMemoryTenantConfigRepository();

    // Tenant 1 Config: Brevo for Email, OpenWA for WhatsApp
    const tenant1Config: TenantNotificationConfig = {
      tenantId: 1,
      tenantCode: "TENANT-001",
      email: {
        provider: "brevo",
        apiKey: "brevo_key_tenant_1",
        senderEmail: "orders@tenant1.in",
        senderName: "Tenant One Laundry",
      },
      whatsapp: {
        provider: "openwa",
        openwaBaseUrl: "https://openwa.tenant1.local",
        openwaApiKey: "openwa_key_tenant_1",
        openwaSessionName: "tenant1-session",
      },
      updatedAtIso: new Date().toISOString(),
    };

    // Tenant 2 Config: Resend for Email, WhatsApp Cloud for WhatsApp
    const tenant2Config: TenantNotificationConfig = {
      tenantId: 2,
      tenantCode: "TENANT-002",
      email: {
        provider: "resend",
        apiKey: "re_tenant_2_secret",
        senderEmail: "notify@tenant2.in",
        senderName: "Tenant Two Drycleaners",
      },
      whatsapp: {
        provider: "whatsapp_cloud",
        whatsappAccessToken: "meta_token_tenant_2",
        whatsappPhoneNumberId: "phone_id_99999",
      },
      updatedAtIso: new Date().toISOString(),
    };

    await repo.saveTenantConfig(tenant1Config);
    await repo.saveTenantConfig(tenant2Config);

    const app = createNotificationsApp({
      tenantConfigRepo: repo,
      fetchFn: mockFetch as any,
    });

    // --- TEST 1: Tenant 1 dispatches email via Brevo ---
    const t1EmailReq = new Request("http://localhost/api/v1/notifications/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "1",
      },
      body: JSON.stringify({
        channel: "email",
        recipient: "customer1@example.com",
        subject: "Your Order is Ready",
        body: "Your clothes are ready for pickup!",
      }),
    });
    const t1EmailRes = await app.fetch(t1EmailReq);
    expect(t1EmailRes.status).toBe(200);
    const t1EmailData = ((await t1EmailRes.json()) as any).data;
    expect(t1EmailData.success).toBe(true);
    expect(t1EmailData.channel).toBe("email");
    expect(t1EmailData.provider).toBe("brevo");
    expect(t1EmailData.messageId).toContain("brevo_key_tenant_1");

    // --- TEST 2: Tenant 2 dispatches email via Resend ---
    const t2EmailReq = new Request("http://localhost/api/v1/notifications/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "2",
      },
      body: JSON.stringify({
        channel: "email",
        recipient: "customer2@example.com",
        subject: "Your Order is Picked Up",
        body: "Your laundry is now processing.",
      }),
    });
    const t2EmailRes = await app.fetch(t2EmailReq);
    expect(t2EmailRes.status).toBe(200);
    const t2EmailData = ((await t2EmailRes.json()) as any).data;
    expect(t2EmailData.success).toBe(true);
    expect(t2EmailData.channel).toBe("email");
    expect(t2EmailData.provider).toBe("resend");
    expect(t2EmailData.messageId).toContain("re_tenant_2_secret");

    // --- TEST 3: Tenant 1 dispatches WhatsApp via OpenWA ---
    const t1WaReq = new Request("http://localhost/api/v1/notifications/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "1",
      },
      body: JSON.stringify({
        channel: "whatsapp",
        recipient: "+919876543210",
        body: "Hi! Your laundry is ready.",
      }),
    });
    const t1WaRes = await app.fetch(t1WaReq);
    expect(t1WaRes.status).toBe(200);
    const t1WaData = ((await t1WaRes.json()) as any).data;
    expect(t1WaData.success).toBe(true);
    expect(t1WaData.channel).toBe("whatsapp");
    expect(t1WaData.provider).toBe("openwa");

    // --- TEST 4: Tenant 2 dispatches WhatsApp via WhatsApp Cloud API ---
    const t2WaReq = new Request("http://localhost/api/v1/notifications/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "2",
      },
      body: JSON.stringify({
        channel: "whatsapp",
        recipient: "+919876543211",
        body: "Hello! Order confirmed.",
      }),
    });
    const t2WaRes = await app.fetch(t2WaReq);
    expect(t2WaRes.status).toBe(200);
    const t2WaData = ((await t2WaRes.json()) as any).data;
    expect(t2WaData.success).toBe(true);
    expect(t2WaData.channel).toBe("whatsapp");
    expect(t2WaData.provider).toBe("whatsapp_cloud");
    expect(t2WaData.messageId).toBe("waba_msg_202");
  });

  it("dispatches SMS using the standard GenericHttpSmsAdapter", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedBody = init?.body ? JSON.parse(init.body as string) : null;
      return new Response(JSON.stringify({ message_id: "sms_test_999", status: "sent" }), {
        status: 200,
      });
    });

    const repo = new InMemoryTenantConfigRepository({
      tenantId: 1,
      sms: {
        provider: "generic_http",
        endpointUrl: "https://api.sms-provider.in/messages",
        httpMethod: "POST",
        apiKey: "secret_sms_api_key",
        senderId: "FRESHF",
      },
      updatedAtIso: new Date().toISOString(),
    });

    const app = createNotificationsApp({
      tenantConfigRepo: repo,
      fetchFn: mockFetch as any,
    });

    const req = new Request("http://localhost/api/v1/notifications/send", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": "1" },
      body: JSON.stringify({
        channel: "sms",
        recipient: "9876543210",
        body: "Your FreshFold verification code is 123456",
      }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const data = ((await res.json()) as any).data;
    expect(data.success).toBe(true);
    expect(data.channel).toBe("sms");
    expect(data.provider).toBe("generic_http");
    expect(data.messageId).toBe("sms_test_999");
    expect(capturedUrl).toBe("https://api.sms-provider.in/messages");
    expect(capturedBody.sender_id).toBe("FRESHF");
    expect(capturedBody.to).toBe("9876543210");
  });

  it("validates payloads and returns structured 422 for malformed requests", async () => {
    const app = createNotificationsApp();
    const req = new Request("http://localhost/api/v1/notifications/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "invalid_channel",
        body: "test",
      }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("ValidationError");
  });

  it("supports reading and updating tenant provider configuration", async () => {
    const repo = new InMemoryTenantConfigRepository();
    const app = createNotificationsApp({ tenantConfigRepo: repo });

    // 1. Update config for Tenant 5
    const updateReq = new Request("http://localhost/api/v1/tenants/5/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId: 5,
        email: {
          provider: "brevo",
          apiKey: "brevo_secret_key_123",
          senderEmail: "ops@tenant5.com",
          senderName: "Tenant Five Laundry",
        },
      }),
    });

    const updateRes = await app.fetch(updateReq);
    expect(updateRes.status).toBe(200);

    // 2. Fetch config and ensure API keys are masked
    const getReq = new Request("http://localhost/api/v1/tenants/5/config");
    const getRes = await app.fetch(getReq);
    expect(getRes.status).toBe(200);
    const getData = ((await getRes.json()) as any).data;
    expect(getData.tenantId).toBe(5);
    expect(getData.email.provider).toBe("brevo");
    expect(getData.email.apiKey).toBe("••••••••");
  });

  it("handles high-throughput queueing, priority, and idempotency via NotificationQueueManager", async () => {
    const mockStorageMap = new Map<string, any>();
    const mockStorage = {
      get: vi.fn(async (key: string) => mockStorageMap.get(key)),
      put: vi.fn(async (key: string, val: any) => {
        mockStorageMap.set(key, val);
      }),
      setAlarm: vi.fn(async () => {}),
    };

    const { NotificationQueueManager } = await import(
      "../../workers/notifications/src/infrastructure/durable-objects/notification-queue.do"
    );

    const queueManager = new NotificationQueueManager(mockStorage);
    await queueManager.init();

    const mockService = {
      send: vi.fn().mockResolvedValue({
        success: true,
        channel: "sms",
        provider: "generic_http",
        recipient: "+919876543210",
        messageId: "sms_sent_101",
        sentAtIso: new Date().toISOString(),
      }),
      sendBatch: vi.fn(),
    };

    queueManager.setNotificationService(mockService);

    // 1. Enqueue normal message
    const res1 = await queueManager.enqueue({
      tenantId: 1,
      channel: "email",
      recipient: "normal@example.com",
      body: "Weekly laundry newsletter",
      idempotencyKey: "idem_key_1",
    });
    expect(res1.status).toBe("queued");
    expect(res1.position).toBe(1);

    // 2. Enqueue high-priority OTP message (jumps ahead in queue)
    const res2 = await queueManager.enqueue({
      tenantId: 1,
      channel: "sms",
      recipient: "+919876543210",
      body: "Your OTP code is 445566",
      metadata: { priority: "high" },
    });
    expect(res2.status).toBe("queued");

    // 3. Duplicate send with same idempotencyKey after drain is deduplicated
    await queueManager.drain();
    expect(mockService.send).toHaveBeenCalled();

    const res3 = await queueManager.enqueue({
      tenantId: 1,
      channel: "email",
      recipient: "normal@example.com",
      body: "Weekly laundry newsletter",
      idempotencyKey: "idem_key_1",
    });
    expect(res3.status).toBe("deduplicated");
    expect(res3.result?.success).toBe(true);

    const stats = await queueManager.getStats();
    expect(stats.processedCount).toBeGreaterThanOrEqual(1);
  });

  it("persists logs and protects against duplicates via D1NotificationLedgerRepository", async () => {
    const mockRows: any[] = [];
    const mockDb = {
      prepare: (sql: string) => {
        let boundParams: any[] = [];
        return {
          bind: (...params: any[]) => {
            boundParams = params;
            return {
              run: async () => {
                if (sql.includes("INSERT INTO notification_logs")) {
                  mockRows.push({
                    id: boundParams[0],
                    tenant_id: boundParams[1],
                    channel: boundParams[2],
                    provider: boundParams[3],
                    recipient: boundParams[4],
                    subject: boundParams[5],
                    body: boundParams[6],
                    template_id: boundParams[7],
                    status: boundParams[8],
                    idempotency_key: boundParams[9],
                    metadata_json: boundParams[10],
                    retry_count: 0,
                    created_at: boundParams[11],
                    sent_at: null,
                  });
                } else if (sql.includes("UPDATE notification_logs")) {
                  const row = mockRows.find((r) => r.id === boundParams[4]);
                  if (row) {
                    row.status = boundParams[0];
                    row.provider_message_id = boundParams[1] || row.provider_message_id;
                    row.sent_at = boundParams[3] || row.sent_at;
                  }
                }
                return { success: true };
              },
              first: async () => {
                if (sql.includes("WHERE tenant_id = ? AND idempotency_key = ?")) {
                  return mockRows.find(
                    (r) => r.tenant_id === boundParams[0] && r.idempotency_key === boundParams[1],
                  );
                }
                return null;
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const { D1NotificationLedgerRepository } = await import(
      "../../workers/notifications/src/infrastructure/repositories/d1-notification-ledger.repository"
    );

    const ledger = new D1NotificationLedgerRepository(mockDb);

    // Create log
    const created = await ledger.createLog({
      id: "log_test_01",
      tenantId: 1,
      channel: "whatsapp",
      provider: "openwa",
      recipient: "+919876543210",
      body: "Laundry order confirmed",
      idempotencyKey: "idem_order_101",
    });

    expect(created.id).toBe("log_test_01");
    expect(created.status).toBe("queued");

    // Mark sent
    await ledger.markStatus("log_test_01", "sent", {
      providerMessageId: "openwa_resp_888",
    });

    // Lookup by idempotency key
    const found = await ledger.findByIdempotencyKey(1, "idem_order_101");
    expect(found).not.toBeNull();
    expect(found?.status).toBe("sent");
    expect(found?.providerMessageId).toBe("openwa_resp_888");
  });
});
