import {
  employeeHubMembershipSchema,
  employeeRecordSchema,
  type MembershipResolutionResponse,
} from "../../../../packages/contracts/src/supabase-auth";
import {
  PERMISSIONS,
  can,
  type Permission,
} from "../../../../packages/domain/src/permissions";

type EmployeeRow = {
  id: string;
  supabase_subject: string;
  email: string;
  display_name: string;
  status: "active" | "inactive" | "revoked";
  created_at: number;
  updated_at: number;
};

type MembershipRow = {
  employee_id: string;
  tenant_id: string;
  hub_id: string;
  role: "front_desk" | "manager" | "service";
  created_at: number;
};

export type MembershipResolution =
  | { ok: true; response: MembershipResolutionResponse }
  | {
      ok: false;
      status: 403;
      error: "membership_missing" | "membership_inactive" | "cross_tenant_denied";
    };

export async function resolveEmployeeMembership(
  db: D1Database,
  supabaseSubject: string,
  requestedHubId?: string,
): Promise<MembershipResolution> {
  const employee = await db
    .prepare(
      `SELECT id, supabase_subject, email, display_name, status, created_at, updated_at
         FROM employees
        WHERE supabase_subject = ?`,
    )
    .bind(supabaseSubject)
    .first<EmployeeRow>();

  if (!employee) {
    return { ok: false, status: 403, error: "membership_missing" };
  }

  if (employee.status !== "active") {
    return { ok: false, status: 403, error: "membership_inactive" };
  }

  const memberships = await db
    .prepare(
      `SELECT employee_id, tenant_id, hub_id, role, created_at
         FROM employee_hub_memberships
        WHERE employee_id = ?
        ORDER BY created_at ASC, hub_id ASC`,
    )
    .bind(employee.id)
    .all<MembershipRow>();

  const rows = memberships.results;
  if (rows.length === 0) {
    return { ok: false, status: 403, error: "membership_missing" };
  }

  const selectedRow = requestedHubId
    ? rows.find((row) => row.hub_id === requestedHubId)
    : rows[0];

  if (!selectedRow) {
    return { ok: false, status: 403, error: "cross_tenant_denied" };
  }

  const selected = employeeHubMembershipSchema.parse(toMembership(selectedRow));
  const permissions: Permission[] = PERMISSIONS.filter((permission) =>
    can(selected.role, permission),
  );

  return {
    ok: true,
    response: {
      employee: employeeRecordSchema.parse(toEmployee(employee)),
      selected,
      memberships: rows.map((row) =>
        employeeHubMembershipSchema.parse(toMembership(row)),
      ),
      permissions,
    },
  };
}

function toEmployee(row: EmployeeRow) {
  return {
    id: row.id,
    supabaseSubject: row.supabase_subject,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMembership(row: MembershipRow) {
  return {
    employeeId: row.employee_id,
    tenantId: row.tenant_id,
    hubId: row.hub_id,
    role: row.role,
    createdAt: row.created_at,
  };
}
