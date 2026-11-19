import { z } from "zod";
import { orderStatusSchema, type OrderStatus } from "./orders";
import { applyChangeIntentSchema, type ApplyChangeIntent } from "./mutations";

/**
 * Bit allocations for 32-bit compact CRN:
 * - 9 bits for tenant_id: 0..511 (0x1FF)
 * - 4 bits for hub_id: 0..15 (0xF)
 * - 19 bits for order_id: 0..524,287 (0x7FFFF)
 * Total: 9 + 4 + 19 = 32 bits
 */
export const CRN_TENANT_BITS = 9;
export const CRN_HUB_BITS = 4;
export const CRN_ORDER_BITS = 19;

export const CRN_TENANT_MAX = (1 << CRN_TENANT_BITS) - 1; // 511
export const CRN_HUB_MAX = (1 << CRN_HUB_BITS) - 1; // 15
export const CRN_ORDER_MAX = (1 << CRN_ORDER_BITS) - 1; // 524,287

export interface CrnComponents {
  tenantId: number;
  hubId: number;
  orderId: number;
}

export const crnComponentsSchema = z.object({
  tenantId: z.number().int().min(0).max(CRN_TENANT_MAX),
  hubId: z.number().int().min(0).max(CRN_HUB_MAX),
  orderId: z.number().int().min(0).max(CRN_ORDER_MAX),
});

const CRN_REGEX = /^crn:(\d+):(\d+):(\d+)$/;

export const crnStringSchema = z
  .string()
  .regex(CRN_REGEX, "CRN must match format crn:tenant_id:hub_id:order_id")
  .refine((val) => {
    try {
      parseCrn(val);
      return true;
    } catch {
      return false;
    }
  }, "CRN values exceed bit limits (tenant: 9-bit/511, hub: 4-bit/15, order: 19-bit/524287)");

/**
 * Pack tenant, hub, and order integer IDs into a 32-bit unsigned integer.
 */
export function packCrn(components: CrnComponents): number {
  crnComponentsSchema.parse(components);
  const { tenantId, hubId, orderId } = components;

  return (
    (((tenantId & CRN_TENANT_MAX) << (CRN_HUB_BITS + CRN_ORDER_BITS)) |
      ((hubId & CRN_HUB_MAX) << CRN_ORDER_BITS) |
      (orderId & CRN_ORDER_MAX)) >>>
    0
  );
}

/**
 * Unpack a 32-bit unsigned integer into tenant, hub, and order IDs.
 */
export function unpackCrn(packed: number): CrnComponents {
  if (packed < 0 || packed > 0xffffffff || !Number.isInteger(packed)) {
    throw new Error("Invalid packed CRN: must be a 32-bit unsigned integer");
  }

  const tenantId = (packed >>> (CRN_HUB_BITS + CRN_ORDER_BITS)) & CRN_TENANT_MAX;
  const hubId = (packed >>> CRN_ORDER_BITS) & CRN_HUB_MAX;
  const orderId = packed & CRN_ORDER_MAX;

  return { tenantId, hubId, orderId };
}

/**
 * Format components into canonical URN string: crn:tenant_id:hub_id:order_id
 */
export function formatCrn(components: CrnComponents): string {
  crnComponentsSchema.parse(components);
  return `crn:${components.tenantId}:${components.hubId}:${components.orderId}`;
}

/**
 * Parse a canonical URN string into its numeric components.
 */
export function parseCrn(crn: string): CrnComponents {
  const match = CRN_REGEX.exec(crn.trim());
  if (!match) {
    throw new Error(`Invalid CRN format: "${crn}". Expected crn:tenant_id:hub_id:order_id`);
  }

  const tenantId = Number.parseInt(match[1], 10);
  const hubId = Number.parseInt(match[2], 10);
  const orderId = Number.parseInt(match[3], 10);

  return crnComponentsSchema.parse({ tenantId, hubId, orderId });
}

/**
 * Check if a string is a valid CRN.
 */
export function isValidCrn(crn: string): boolean {
  try {
    parseCrn(crn);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cloudflare KV State Snapshot schema for diagnostic observability.
 */
export const orderDiagnosticStatusSchema = z.enum(["healthy", "held", "broken", "cancelled"]);
export type OrderDiagnosticStatus = z.infer<typeof orderDiagnosticStatusSchema>;

export const orderStateSnapshotSchema = z.object({
  crnId: crnStringSchema.or(z.string().min(1)),
  orderId: z.string().min(1),
  tenantId: z.string().or(z.number()),
  hubId: z.string().or(z.number()),
  previousState: orderStatusSchema.nullable(),
  currentState: orderStatusSchema,
  intent: applyChangeIntentSchema,
  version: z.number().int().nonnegative(),
  changedAt: z.number().int(),
  actor: z.object({
    actorType: z.enum(["user", "service", "system"]),
    actorId: z.string().nullable(),
    role: z.string().optional(),
  }),
  diagnostic: z.object({
    status: orderDiagnosticStatusSchema,
    reason: z.string().nullable().optional(),
    brokenStep: z.string().nullable().optional(),
    lastMutationId: z.string(),
    errorCode: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
  }),
});

export type OrderStateSnapshot = z.infer<typeof orderStateSnapshotSchema>;

