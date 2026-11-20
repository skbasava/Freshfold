import type { Context } from "hono";
import { z } from "zod";
import type { INotificationService } from "../../domain/interfaces/notification-service.interface";

const outboundMessageSchema = z.object({
  tenantId: z.number().int().positive().optional(),
  channel: z.enum(["email", "whatsapp", "sms", "push"]),
  recipient: z.string().min(1, "Recipient is required"),
  subject: z.string().optional(),
  body: z.string().min(1, "Notification body is required"),
  templateId: z.string().optional(),
  templateVariables: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        contentBase64: z.string(),
      }),
    )
    .optional(),
  idempotencyKey: z.string().optional(),
  async: z.boolean().optional(),
});

const batchMessageSchema = z.object({
  messages: z.array(outboundMessageSchema).min(1, "At least one message is required"),
});

export class NotificationHandler {
  constructor(
    private readonly service: INotificationService,
    private readonly queueNamespace?: any, // DurableObjectNamespace<NotificationQueueDurableObject>
  ) {}

  send = async (c: Context): Promise<Response> => {
    const rawBody = await c.req.json().catch(() => null);
    if (!rawBody) {
      return c.json({ error: "BadRequest", message: "Invalid JSON body" }, 400);
    }

    const parsed = outboundMessageSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          error: "ValidationError",
          details: parsed.error.issues,
        },
        422,
      );
    }

    const contextTenantId = c.get("tenantId") || 1;
    const message = {
      ...parsed.data,
      tenantId: parsed.data.tenantId ?? contextTenantId,
    };

    // If caller requests async queueing and DO namespace is bound, route to Durable Object
    const queueBinding = this.queueNamespace || (c.env as any)?.NOTIFICATION_QUEUE;
    if (parsed.data.async && queueBinding) {
      const tenantDoId = queueBinding.idFromName(`tenant_${message.tenantId}`);
      const stub = queueBinding.get(tenantDoId);
      const queueRes = await stub.fetch("http://do/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
      });
      const queueData = await queueRes.json();
      return c.json({ data: queueData }, 202);
    }

    const result = await this.service.send(message);
    const status = result.success ? 200 : 502;

    return c.json({ data: result }, status);
  };

  enqueue = async (c: Context): Promise<Response> => {
    const rawBody = await c.req.json().catch(() => null);
    if (!rawBody) {
      return c.json({ error: "BadRequest", message: "Invalid JSON body" }, 400);
    }

    const parsed = outboundMessageSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          error: "ValidationError",
          details: parsed.error.issues,
        },
        422,
      );
    }

    const contextTenantId = c.get("tenantId") || 1;
    const message = {
      ...parsed.data,
      tenantId: parsed.data.tenantId ?? contextTenantId,
    };

    const queueBinding = this.queueNamespace || (c.env as any)?.NOTIFICATION_QUEUE;
    if (queueBinding) {
      const tenantDoId = queueBinding.idFromName(`tenant_${message.tenantId}`);
      const stub = queueBinding.get(tenantDoId);
      const queueRes = await stub.fetch("http://do/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message),
      });
      const queueData = await queueRes.json();
      return c.json({ data: queueData }, 202);
    }

    // Fallback if DO is not bound in local test: dispatch directly
    const result = await this.service.send(message);
    return c.json({ data: { status: "dispatched", result } }, result.success ? 200 : 502);
  };

  getQueueStats = async (c: Context): Promise<Response> => {
    const contextTenantId = c.get("tenantId") || 1;
    const queueBinding = this.queueNamespace || (c.env as any)?.NOTIFICATION_QUEUE;

    if (!queueBinding) {
      return c.json({ data: { pendingCount: 0, processedCount: 0, failedCount: 0 } });
    }

    const tenantDoId = queueBinding.idFromName(`tenant_${contextTenantId}`);
    const stub = queueBinding.get(tenantDoId);
    const statsRes = await stub.fetch("http://do/stats");
    const statsData = await statsRes.json();
    return c.json({ data: statsData });
  };

  sendBatch = async (c: Context): Promise<Response> => {
    const rawBody = await c.req.json().catch(() => null);
    if (!rawBody) {
      return c.json({ error: "BadRequest", message: "Invalid JSON body" }, 400);
    }

    const parsed = batchMessageSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          error: "ValidationError",
          details: parsed.error.issues,
        },
        422,
      );
    }

    const contextTenantId = c.get("tenantId") || 1;
    const messages = parsed.data.messages.map((m) => ({
      ...m,
      tenantId: m.tenantId ?? contextTenantId,
    }));

    const results = await this.service.sendBatch(messages);
    return c.json({ data: results });
  };
}
