import { z } from "zod";

export const tenantStatusSchema = z.enum([
  "active",
  "suspended",
  "trial",
  "deleted",
]);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

export const planTierSchema = z.enum([
  "trial",
  "standard",
  "pro",
  "enterprise",
]);
export type PlanTier = z.infer<typeof planTierSchema>;

export const tenantSettingsSchema = z.record(z.string(), z.unknown());
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

export const tenantMetadataSchema = z.record(z.string(), z.unknown());
export type TenantMetadata = z.infer<typeof tenantMetadataSchema>;

export const defaultHubProvisionInputSchema = z.object({
  name: z.string().min(1).max(256),
  code: z.string().min(1).max(16).regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric"),
  timezone: z.string().min(1).default("Asia/Kolkata"),
  address: z.string().optional(),
  phone: z.string().optional(),
});
export type DefaultHubProvisionInput = z.infer<typeof defaultHubProvisionInputSchema>;

export const tenantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  status: tenantStatusSchema,
  planTier: planTierSchema,
  settings: tenantSettingsSchema,
  metadata: tenantMetadataSchema,
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  rcVersion: z.string().optional(),
  version: z.number().int().positive(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable().optional(),
});
export type Tenant = z.infer<typeof tenantSchema>;

export const tenantSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  status: tenantStatusSchema,
  planTier: planTierSchema,
  hubCount: z.number().int().nonnegative().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type TenantSummary = z.infer<typeof tenantSummarySchema>;

export const createTenantRequestSchema = z.object({
  name: z.string().min(1).max(256),
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens")
    .optional(),
  planTier: planTierSchema.optional().default("standard"),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  defaultHub: defaultHubProvisionInputSchema.optional(),
  settings: tenantSettingsSchema.optional().default({}),
  metadata: tenantMetadataSchema.optional().default({}),
});
export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;

export const updateTenantRequestSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens")
    .optional(),
  planTier: planTierSchema.optional(),
  status: tenantStatusSchema.optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  settings: tenantSettingsSchema.optional(),
  metadata: tenantMetadataSchema.optional(),
  baseVersion: z.number().int().positive().optional(),
});
export type UpdateTenantRequest = z.infer<typeof updateTenantRequestSchema>;

export const tenantListQuerySchema = z.object({
  status: tenantStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});
export type TenantListQuery = z.infer<typeof tenantListQuerySchema>;

export const tenantListResponseSchema = z.object({
  items: z.array(tenantSummarySchema),
  nextCursor: z.string().nullable(),
});
export type TenantListResponse = z.infer<typeof tenantListResponseSchema>;

export const deleteTenantResponseSchema = z.object({
  id: z.string().min(1),
  status: z.literal("deleted"),
  deletedAt: z.number().int(),
  message: z.string(),
});
export type DeleteTenantResponse = z.infer<typeof deleteTenantResponseSchema>;

