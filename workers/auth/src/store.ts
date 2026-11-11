import type { Role } from "../../../packages/contracts/src/auth";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  is_active: number;
};

type MembershipRow = {
  tenant_id: string;
  hub_id: string;
  role: Role;
};

type SessionRow = {
  token_hash: string;
  user_id: string;
  tenant_id: string;
  hub_id: string;
  csrf_hash: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
  last_seen_at: number | null;
  email: string;
  display_name: string;
  is_active: number;
  role: Role;
};

export type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  isActive: boolean;
};

export type MembershipRecord = {
  tenantId: string;
  hubId: string;
  role: Role;
};

export type SessionRecord = {
  tokenHash: string;
  userId: string;
  tenantId: string;
  hubId: string;
  csrfHash: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  lastSeenAt: number | null;
  email: string;
  displayName: string;
  isActive: boolean;
  role: Role;
};

export type NewSession = {
  tokenHash: string;
  userId: string;
  tenantId: string;
  hubId: string;
  csrfHash: string;
  createdAt: number;
  expiresAt: number;
};

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordIterations: row.password_iterations,
    isActive: row.is_active === 1,
  };
}

function toSession(row: SessionRow): SessionRecord {
  return {
    tokenHash: row.token_hash,
    userId: row.user_id,
    tenantId: row.tenant_id,
    hubId: row.hub_id,
    csrfHash: row.csrf_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastSeenAt: row.last_seen_at,
    email: row.email,
    displayName: row.display_name,
    isActive: row.is_active === 1,
    role: row.role,
  };
}

export async function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<UserRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, email, display_name, password_hash, password_salt,
              password_iterations, is_active
       FROM users
       WHERE email = ? AND is_active = 1
       LIMIT 1`,
    )
    .bind(email)
    .first<UserRow>();

  return row ? toUser(row) : null;
}

export async function listMemberships(
  db: D1Database,
  userId: string,
): Promise<MembershipRecord[]> {
  const result = await db
    .prepare(
      `SELECT tenant_id, hub_id, role
       FROM user_hub_memberships
       WHERE user_id = ?
       ORDER BY tenant_id, hub_id`,
    )
    .bind(userId)
    .all<MembershipRow>();

  return result.results.map((row) => ({
    tenantId: row.tenant_id,
    hubId: row.hub_id,
    role: row.role,
  }));
}

export async function createSession(
  db: D1Database,
  session: NewSession,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions
        (token_hash, user_id, tenant_id, hub_id, csrf_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      session.tokenHash,
      session.userId,
      session.tenantId,
      session.hubId,
      session.csrfHash,
      session.createdAt,
      session.expiresAt,
    )
    .run();
}

export async function findSessionByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<SessionRecord | null> {
  const row = await db
    .prepare(
      `SELECT s.token_hash, s.user_id, s.tenant_id, s.hub_id, s.csrf_hash,
              s.created_at, s.expires_at, s.revoked_at, s.last_seen_at,
              u.email, u.display_name, u.is_active, m.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN user_hub_memberships m
         ON m.user_id = s.user_id
        AND m.hub_id = s.hub_id
        AND m.tenant_id = s.tenant_id
       WHERE s.token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<SessionRow>();

  return row ? toSession(row) : null;
}

export async function revokeSession(
  db: D1Database,
  tokenHash: string,
  revokedAt: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE sessions
       SET revoked_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL`,
    )
    .bind(revokedAt, tokenHash)
    .run();
}
