# Auth Runbook

## Architecture

- `workers/auth` owns `AUTH_DB`. It is internal-only (`workers_dev: false`).
- `workers/gateway` exposes `POST /auth/login`, `GET /auth/session`, and `POST /auth/logout` as service-binding proxies.
- The Gateway calls `GET /internal/session` through the `AUTH` binding and forwards a trusted context to the Laundry Worker. Client-supplied role, hub, or tenant headers are ignored.

## Schema

- `users`: credential record with `is_active` and PBKDF2 parameters.
- `user_hub_memberships`: `(user_id, hub_id)` to `(tenant_id, role)`.
- `sessions`: SHA-256 hash of the session token, SHA-256 hash of the CSRF token, hub/tenant binding, expiry, and revocation timestamp.

## Endpoints

| Method | Path | Caller | Purpose |
|---|---|---|---|
| `POST` | `/auth/login` | Browser via Gateway | Verify credentials, select a permitted hub, rotate the session, set the session and CSRF cookies |
| `GET` | `/auth/session` | Browser via Gateway | Return the current user, hub, and role |
| `POST` | `/auth/logout` | Browser via Gateway | Require the CSRF token, revoke the session, clear both cookies |
| `GET` | `/internal/session` | Gateway service binding | Return the signed-context-shaped internal identity |

## Security Checklist

- [x] PBKDF2-HMAC-SHA256 with a per-user 16-byte salt and 600,000 iterations.
- [x] Only password hashes and salts are stored; plaintext passwords never touch D1.
- [x] Session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and host-only.
- [x] Login sets a `laundry_csrf` cookie that is readable by the frontend, `Secure`, `SameSite=Lax`, and `Path=/`.
- [x] Logout clears both the session and CSRF cookies.
- [x] Raw session and CSRF tokens are never stored; only SHA-256 hashes are persisted.
- [x] Login rotates an existing session and logout sets `revoked_at`.
- [x] Roles are read from `user_hub_memberships` on every verification, so role changes and removals take effect immediately.
- [x] Logout requires the CSRF token returned at login.
- [x] Client-supplied `role`, `hubId`, `tenantId`, and identity headers are ignored.
- [x] Internal Workers disable `workers_dev`.
- [x] Gateway login rate limiting is implemented in T-062 using `LOGIN_RATE_LIMITER`.
- [x] Gateway state-changing `/api/*` requests require the CSRF header and cookie.
- [ ] Staging Auth integration test is run with real staging resources.

## Migrations

```bash
pnpm db:auth:migrate:local
pnpm db:auth:migrate:remote
```

Review generated SQL before applying remotely. The remote `database_id` is a placeholder until the real D1 database is created.

## Secret Rotation

- `AUTH_SESSION_SECRET` is reserved for future signed-cookie or token work; no secret is currently required by the Auth Worker.
- Store secrets with `wrangler secret put`; never commit them.
- Rotate one environment at a time and verify login, session verification, and logout before moving to the next environment.
