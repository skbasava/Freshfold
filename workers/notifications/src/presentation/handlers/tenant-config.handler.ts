import type { Context } from "hono";
import { z } from "zod";
import type { TenantConfigService } from "../../application/services/tenant-config.service";

const tenantConfigSchema = z.object({
  tenantId: z.number().int().positive(),
  tenantCode: z.string().optional(),
  email: z
    .object({
      provider: z.enum(["brevo", "resend"]),
      apiKey: z.string().min(1),
      senderEmail: z.string().email(),
      senderName: z.string().min(1),
    })
    .optional(),
  whatsapp: z
    .object({
      provider: z.enum(["openwa", "whatsapp_cloud"]),
      openwaBaseUrl: z.string().url().optional(),
      openwaApiKey: z.string().optional(),
      openwaSessionName: z.string().optional(),
      whatsappAccessToken: z.string().optional(),
      whatsappPhoneNumberId: z.string().optional(),
      whatsappWabaId: z.string().optional(),
    })
    .optional(),
  sms: z
    .object({
      provider: z.literal("generic_http"),
      endpointUrl: z.string().url(),
      httpMethod: z.enum(["GET", "POST"]).default("POST"),
      apiKey: z.string().default(""),
      senderId: z.string().optional(),
      authHeaderName: z.string().optional(),
      authHeaderPrefix: z.string().optional(),
      toParamName: z.string().optional(),
      messageParamName: z.string().optional(),
      customHeaders: z.record(z.string(), z.string()).optional(),
      extraQueryParams: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  push: z
    .object({
      provider: z.literal("web_push"),
      vapidPublicKey: z.string().optional(),
      vapidPrivateKey: z.string().optional(),
      subject: z.string().optional(),
    })
    .optional(),
});

export class TenantConfigHandler {
  constructor(private readonly service: TenantConfigService) {}

  getConfig = async (c: Context): Promise<Response> => {
    const tenantIdParam = parseInt(c.req.param("tenantId") ?? "", 10);
    if (isNaN(tenantIdParam) || tenantIdParam <= 0) {
      return c.json({ error: "BadRequest", message: "Invalid tenant ID" }, 400);
    }

    const config = await this.service.getConfig(tenantIdParam);
    if (!config) {
      return c.json(
        { error: "NotFound", message: `Configuration not found for tenant ${tenantIdParam}` },
        404,
      );
    }

    // Mask sensitive API keys in the response
    const safeConfig = {
      ...config,
      email: config.email
        ? {
            ...config.email,
            apiKey: config.email.apiKey ? "••••••••" : "",
          }
        : undefined,
      whatsapp: config.whatsapp
        ? {
            ...config.whatsapp,
            openwaApiKey: config.whatsapp.openwaApiKey ? "••••••••" : undefined,
            whatsappAccessToken: config.whatsapp.whatsappAccessToken ? "••••••••" : undefined,
          }
        : undefined,
      sms: config.sms
        ? {
            ...config.sms,
            apiKey: config.sms.apiKey ? "••••••••" : "",
          }
        : undefined,
    };

    return c.json({ data: safeConfig });
  };

  updateConfig = async (c: Context): Promise<Response> => {
    const tenantIdParam = parseInt(c.req.param("tenantId") ?? "", 10);
    if (isNaN(tenantIdParam) || tenantIdParam <= 0) {
      return c.json({ error: "BadRequest", message: "Invalid tenant ID" }, 400);
    }

    const rawBody = await c.req.json().catch(() => null);
    if (!rawBody) {
      return c.json({ error: "BadRequest", message: "Invalid JSON body" }, 400);
    }

    const parsed = tenantConfigSchema.safeParse({
      ...rawBody,
      tenantId: tenantIdParam,
    });

    if (!parsed.success) {
      return c.json(
        {
          error: "ValidationError",
          details: parsed.error.issues,
        },
        422,
      );
    }

    const saved = await this.service.updateConfig({
      ...parsed.data,
      updatedAtIso: new Date().toISOString(),
    });

    return c.json({ data: saved });
  };
}
