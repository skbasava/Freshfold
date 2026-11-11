import type { Role } from "../../contracts/src/auth";

export const PERMISSIONS = [
  "view_orders",
  "create_order",
  "reschedule_order",
  "update_order_status",
  "cancel_order",
  "view_calendar",
  "manage_calendar",
  "manage_users",
  "replay_dlq",
  "view_audit",
  "internal_service",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const permissionSet: ReadonlySet<string> = new Set(PERMISSIONS);

const rolePermissions: Record<Role, ReadonlySet<Permission>> = {
  front_desk: new Set([
    "view_orders",
    "create_order",
    "update_order_status",
    "view_calendar",
  ]),
  manager: new Set(PERMISSIONS),
  service: new Set(["internal_service"]),
};

export function isPermission(value: string | undefined): value is Permission {
  return value !== undefined && permissionSet.has(value);
}

export function can(role: Role, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
