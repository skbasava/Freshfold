import { z } from "zod";

export const hubSettingsSchema = z.record(z.string(), z.unknown());
export type HubSettings = z.infer<typeof hubSettingsSchema>;

export const hubMetadataSchema = z.record(z.string(), z.unknown());
export type HubMetadata = z.infer<typeof hubMetadataSchema>;

export const hubSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1).max(16).regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric"),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  timezone: z.string().min(1).default("Asia/Kolkata"),
  isActive: z.boolean(),
  rcVersion: z.string().nullable().optional(),
  settings: hubSettingsSchema,
  metadata: hubMetadataSchema,
  version: z.number().int().positive(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable().optional(),
});
export type Hub = z.infer<typeof hubSchema>;

export const hubSummarySchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  timezone: z.string().min(1),
  isActive: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type HubSummary = z.infer<typeof hubSummarySchema>;

export const createHubRequestSchema = z.object({
  tenantId: z.string().min(1).optional(),
  name: z.string().min(1).max(256),
  code: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9_-]+$/, "Code must only contain alphanumeric characters, underscores, or hyphens"),
  address: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().min(1).default("Asia/Kolkata"),
  isActive: z.boolean().default(true),
  settings: hubSettingsSchema.optional().default({}),
  metadata: hubMetadataSchema.optional().default({}),
});
export type CreateHubRequest = z.infer<typeof createHubRequestSchema>;

export const updateHubRequestSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  code: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9_-]+$/, "Code must only contain alphanumeric characters, underscores, or hyphens")
    .optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  timezone: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  settings: hubSettingsSchema.optional(),
  metadata: hubMetadataSchema.optional(),
  baseVersion: z.number().int().positive().optional(),
});
export type UpdateHubRequest = z.infer<typeof updateHubRequestSchema>;

export const hubListQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  isActive: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((val) => (typeof val === "boolean" ? val : val === "true"))
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});
export type HubListQuery = z.infer<typeof hubListQuerySchema>;

export const hubListResponseSchema = z.object({
  items: z.array(hubSummarySchema),
  nextCursor: z.string().nullable(),
});
export type HubListResponse = z.infer<typeof hubListResponseSchema>;

export const deleteHubResponseSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  status: z.literal("deleted"),
  deletedAt: z.number().int(),
  message: z.string(),
});
export type DeleteHubResponse = z.infer<typeof deleteHubResponseSchema>;

