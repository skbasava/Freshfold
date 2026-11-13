import { z } from "zod";

export const roleSchema = z.enum([
  "front_desk",
  "manager",
  "service",
  "owner",
  "counter_staff",
  "operator",
  "finance",
]);
export type Role = z.infer<typeof roleSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(1024),
  hubId: z.string().trim().min(1).max(128).optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authenticatedUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  displayName: z.string().min(1),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export const authenticatedHubSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
});
export type AuthenticatedHub = z.infer<typeof authenticatedHubSchema>;

export const sessionResponseSchema = z.object({
  user: authenticatedUserSchema,
  hub: authenticatedHubSchema,
  role: roleSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const loginResponseSchema = sessionResponseSchema.extend({
  csrfToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const internalContextSchema = z.object({
  actorId: z.string().min(1),
  actorType: z.enum(["user", "service", "system"]),
  role: roleSchema,
  tenantId: z.string().min(1),
  hubId: z.string().min(1),
  exp: z.number().int().positive(),
});
export type InternalContext = z.infer<typeof internalContextSchema>;
