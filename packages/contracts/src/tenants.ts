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

