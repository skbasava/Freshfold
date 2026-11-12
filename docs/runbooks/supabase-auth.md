# Supabase Auth Runbook

**Status:** Active local and staging/production auth architecture (`ADR-015`). Staging and production projects, secrets, and remote validation remain separately gated.

## Scope

- Supabase Auth is the sole staff identity, session validation, and staff authorization provider (`ADR-015`).
- Supabase stores staff accounts, sessions, and server-controlled staff claims (`app_metadata` or Custom Access Token Auth Hook claims). Orders, customers, tenants, hubs, audit, outbox, and capacity data stay in Laundry D1 (`LAUNDRY_DB`).
- The Gateway verifies Supabase access tokens with the project JWKS and resolves `role`, `tenantId`, `hubId`, status, and display name from verified JWT `app_metadata` / Custom Access Token Auth Hook claims on every protected request.
- The legacy Auth Worker (`workers/auth`), `AUTH_DB`, and D1 employee/membership tables (`employees`, `employee_hub_memberships`) have been removed. There is no cookie or CSRF fallback.

## Environment isolation

Use a separate Supabase project, redirect URLs, anon key, JWKS URL, issuer, and secrets for local development, staging, and production. Never reuse a staging or local project in production.

| Environment | Supabase project | Gateway mode |
|---|---|---|
| Local | Local/development project or injected test JWKS | Supabase bearer auth only (no local Auth Worker fallback) |
| Staging | Dedicated staging project | Supabase bearer auth only |
| Production | Dedicated production project | Supabase bearer auth only |

## Supabase project setup

1. Create one project per environment and record its project reference.
2. Enable the Google OAuth provider (with your Google Cloud OAuth Client ID and Client Secret) for staff login.
3. Disable public employee signup so random logins cannot assign themselves `app_metadata`. Only server-controlled `app_metadata` or a Custom Access Token Auth Hook can grant `role`, `tenant_id`, and `hub_id`; users without valid staff claims are denied with `403 membership_missing`.
4. Configure allowed redirect URLs for Google OAuth callback and recovery, including `http://localhost:5173/login/callback` locally and `https://<environment-host>/login/callback` plus `/reset-password` in deployed environments.
5. Configure allowed browser origins for the frontend host.
6. Configure Auth rate limits according to the environment's policy.
7. Use Supabase's asymmetric JWT signing keys. The Gateway accepts only `RS256` and `ES256` by default.
8. Confirm the JWKS endpoint is `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`.

## Staff authorization claims (`app_metadata` / Auth Hook)

On every protected request, Gateway verifies the bearer JWT signature and validates staff authorization using `resolveSupabaseAuthorization(claims)` in `@laundry/contracts`:

- Role: `app_metadata.role` (or `app_metadata.staff_role`, or hook claim `app_role` / `staff_role`). Built-in Supabase `role: "authenticated"` and `user_metadata` are **ignored**.
- Tenant: `app_metadata.tenant_id` (or `tenantId`, or top-level hook claim `tenant_id` / `tenantId`).
- Hub: `app_metadata.hub_id` (or `hubId`, or single-element `hub_ids`, or top-level hook claim).
- Status: defaults to `"active"`; `disabled: true`, `revoked: true`, or `"inactive"` / `"revoked"` status returns `403 membership_inactive`.

Never grant authorization from `user_metadata` because Supabase users can edit their own `user_metadata`.

## Gateway configuration

Non-secret configuration:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_JWT_ALGORITHMS=RS256,ES256
SUPABASE_JWT_CLOCK_SKEW_SECONDS=60
SUPABASE_JWKS_CACHE_TTL_MS=300000
```

Server-only secret shared with Laundry:

```bash
pnpm exec wrangler secret put INTERNAL_CONTEXT_SECRET --config workers/gateway/wrangler.jsonc
pnpm exec wrangler secret put INTERNAL_CONTEXT_SECRET --config workers/laundry/wrangler.jsonc
```

`INTERNAL_CONTEXT_SECRET` signs the forwarded internal actor context from Gateway to Laundry. Rotate the Gateway and Laundry copies together.

Only set `SUPABASE_SERVICE_ROLE_KEY` if a separate server-side administrative operation is approved. It is never shipped to the browser, is not read by Gateway or Laundry code, and must not be added to frontend environment files.

The public `SUPABASE_ANON_KEY` belongs only to frontend configuration. It is not server authorization.

## Local development

- Keep `.dev.vars` local and ignored. Use `.dev.vars.example` placeholders.
- Automated tests inject local JWKS and clock fakes; they never call Supabase.

## Frontend configuration and session handling

The browser uses `@supabase/supabase-js` with the PKCE flow, automatic token
refresh, and session detection in the URL. Split the browser application into
three public values and keep every other Supabase credential server-side:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public anon key>
VITE_SUPABASE_REDIRECT_URL=http://localhost:5173/reset-password
```

- Add the exact callback (`.../login/callback`) and recovery (`.../reset-password`) URLs to the Supabase project's allowed redirect list. Public employee signup stays disabled.
- Use a separate Supabase project and redirect URL for local, staging, and production. Never copy staging or local values into production.
- The anon key is public and is not authorization. A service-role key or `sb_secret_*` key in `VITE_*` configuration is rejected at startup.
- The access token is held in the Supabase client's per-tab `sessionStorage` and sent as `Authorization: Bearer <access_token>` to Gateway `/api/*` with `credentials: "omit"`.
- `GET /api/me` returns the validated `SessionResponse` built from Gateway's verified JWT claims.
- On `401`, refresh failure, or logout the session and access token are cleared, synchronization stops, and the login screen explains that sign-in is required. On `403` (missing or inactive staff claims) the UI signs out the un-authorized Supabase session and displays the error clearly.
- Local order caches use a separate IndexedDB database per employee/tenant/hub scope. Logout or account switching never exposes another employee's cached orders, while pending, rejected, and conflicted mutations remain stored for the original account and are never flushed without a valid session.

## End-to-end validation

Use one Supabase project per environment. Do not reuse local or staging credentials in production.

### 1. Supabase project

- Enable Google OAuth (and/or Email/Password for admin-invited accounts).
- Disable public staff signup and configure redirect URLs (`http://localhost:5173/login/callback`, `http://localhost:5173/reset-password`).
- Set `app_metadata` on the staff user (via Supabase Dashboard -> Authentication -> Users, Admin API, or Custom Access Token Auth Hook):
  ```json
  {
    "role": "manager",
    "tenant_id": "tenant-1",
    "hub_id": "hub-1",
    "display_name": "Local Manager",
    "status": "active"
  }
  ```
- Use asymmetric JWT signing keys (`RS256` or `ES256`).
- Confirm the JWKS endpoint responds: `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`.

### 2. Local backend configuration

Add the Supabase values to `.dev.vars`:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_JWT_ISSUER=https://<project-ref>.supabase.co/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_JWT_ALGORITHMS=RS256,ES256
```

`pnpm dev:live` generates local `SERVICE_TOKEN` and `INTERNAL_CONTEXT_SECRET` values and links `.dev.vars` into each Worker.

### 3. Frontend configuration

Add these public values to `apps/web/.env.development` or `apps/web/.env.local`:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public anon key>
VITE_SUPABASE_REDIRECT_URL=http://localhost:5173/reset-password
```

### 4. Seed local tenant and hub in `LAUNDRY_DB`

Apply the Laundry migration and ensure the matching tenant/hub rows exist in `LAUNDRY_DB` for order creation/reads:

```bash
pnpm db:laundry:migrate:local

NOW="$(date +%s)000"

pnpm exec wrangler d1 execute laundry-core --local \
  --config workers/laundry/wrangler.jsonc \
  --command "
    INSERT OR IGNORE INTO tenants (id, name, created_at)
    VALUES ('tenant-1', 'FreshFold', $NOW);

    INSERT OR IGNORE INTO hubs (id, tenant_id, name, timezone, created_at)
    VALUES ('hub-1', 'tenant-1', 'Main Hub', 'Asia/Kolkata', $NOW);
  "
```

### 5. Verify bearer authentication

Start the application (`pnpm dev:live`) and verify `/api/me`:

```bash
curl -i http://127.0.0.1:8787/api/me
curl -i -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/api/me
curl -i -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/api/orders
```

Expected: `401` without a bearer token; `200` with a valid token containing active `app_metadata` staff claims. `/api/me` returns the `SessionResponse` object (`user`, `hub`, `role`).

### 6. Negative and lifecycle checks

- Tampered, expired, not-yet-valid, wrong-issuer, wrong-audience, and wrong-algorithm tokens return `401 invalid_token` or `401 expired_session`.
- A valid token with missing `app_metadata` / hook claims (or with claims placed only in `user_metadata`) returns `403 membership_missing`.
- Set `app_metadata.status` to `"inactive"` or `"revoked"` (or `disabled: true`); after refreshing the token, protected requests return `403 membership_inactive`.
- Client-supplied role, tenant, hub, email, employee, internal-context, and service headers are ignored.
- JWKS fetch/parse failure returns `503 identity_provider_unavailable` and logs safe diagnostic context (`supabase_jwks_fetch_failed`), never unverified identity.
- Rotate the Supabase signing key; old tokens fail and newly signed tokens succeed after the Gateway refreshes the unknown key id.

### 7. Automated checks

```bash
pnpm exec vitest run \
  tests/unit/supabase-jwt.test.ts \
  tests/unit/supabase-auth-contracts.test.ts \
  tests/unit/supabase-boundaries.test.ts \
  tests/integration/supabase-gateway-auth.test.ts

pnpm test:web
pnpm check
pnpm exec wrangler deploy --dry-run --config workers/gateway/wrangler.jsonc
pnpm exec wrangler deploy --dry-run --config workers/laundry/wrangler.jsonc
```

## Troubleshooting

| Symptom | Check |
|---|---|
| `401 invalid_token` | Token is malformed, has the wrong issuer/audience/algorithm, fails signature verification, or references an unknown key |
| `401 expired_session` | Access token expired; refresh through Supabase and retry |
| `503 identity_provider_unavailable` | JWKS retrieval/parsing failed (`supabase_jwks_fetch_failed` in Gateway logs) or `SUPABASE_URL`/`SUPABASE_JWKS_URL`/`INTERNAL_CONTEXT_SECRET` is missing |
| `403 membership_missing` | Signed-in Supabase user lacks `role`, `tenant_id`, and `hub_id` in `app_metadata` or Custom Access Token Auth Hook claims |
| `403 membership_inactive` | Staff claim status is `inactive`/`revoked` or `disabled`/`revoked` is `true` |
| `403 cross_tenant_denied` | Request target belongs to another tenant or hub |
