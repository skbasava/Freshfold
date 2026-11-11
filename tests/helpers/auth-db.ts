import type { Role } from "../../packages/contracts/src/auth";
import { hashPassword } from "../../workers/auth/src/password";

export type SeedMembership = {
  tenantId: string;
  hubId: string;
  role: Role;
};

export type SeedUserInput = {
  id: string;
  email: string;
  password: string;
  displayName: string;
  memberships: SeedMembership[];
};

export async function seedAuthUser(
  db: D1Database,
  input: SeedUserInput,
): Promise<void> {
  const stored = await hashPassword(input.password, 100_000);
  const now = Date.now();

  await db
    .prepare(
      `INSERT INTO users
        (id, email, display_name, password_hash, password_salt, password_iterations, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(
      input.id,
      input.email,
      input.displayName,
      stored.hash,
      stored.salt,
      stored.iterations,
      now,
      now,
    )
    .run();

  for (const membership of input.memberships) {
    await db
      .prepare(
        `INSERT INTO user_hub_memberships
          (user_id, tenant_id, hub_id, role, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        membership.tenantId,
        membership.hubId,
        membership.role,
        now,
      )
      .run();
  }
}
