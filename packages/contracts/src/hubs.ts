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

