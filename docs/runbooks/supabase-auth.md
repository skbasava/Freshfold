# Supabase Auth Runbook

**Status:** Phase B backend configuration notes. No staging or production project, migration, secret, or end-to-end validation has been performed in this repository.

## Scope

- Supabase Auth is the production staff identity provider.
- Supabase stores identity records and sessions only. Orders, customers, employees, memberships, audit, outbox, and capacity data stay in Laundry D1.
- The Gateway verifies Supabase access tokens with the project JWKS and resolves employee membership from Laundry D1 on every protected request.
- The Auth Worker and `AUTH_DB` remain a local/legacy fallback only. The Gateway disables that fallback when `ENVIRONMENT` is `staging` or `production`.

## Environment isolation

Use a separate Supabase project, redirect URLs, anon key, JWKS URL, issuer, and secrets for local development, staging, and production. Never reuse a staging or local project in production.

| Environment | Supabase project | Gateway fallback |
|---|---|---|
| Local | Local/development project or an injected test JWKS | Allowed by default in development |
| Staging | Dedicated staging project | Disabled |
| Production | Dedicated production project | Disabled |

## Supabase project setup

1. Create one project per environment and record its project reference.
2. Enable email/password authentication.
3. Disable public employee signup. Onboard staff with administrator-controlled invitations.
4. Configure allowed redirect URLs for password reset and email confirmation, for example `https://<environment-host>/reset-password`.
5. Configure allowed browser origins for the deployed frontend host.
6. Configure Auth rate limits and email delivery according to the environment's policy.
7. Use Supabase's asymmetric JWT signing keys. The Gateway accepts only `RS256` and `ES256` by default.
8. Confirm the JWKS endpoint is `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`.

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

Server-only secrets:

```bash
pnpm exec wrangler secret put SERVICE_TOKEN --config workers/gateway/wrangler.jsonc
pnpm exec wrangler secret put SERVICE_TOKEN --config workers/laundry/wrangler.jsonc
pnpm exec wrangler secret put INTERNAL_CONTEXT_SECRET --config workers/gateway/wrangler.jsonc
pnpm exec wrangler secret put INTERNAL_CONTEXT_SECRET --config workers/laundry/wrangler.jsonc
```

`SERVICE_TOKEN` lets the Gateway call the Laundry internal membership resolver as the `gateway` service. `INTERNAL_CONTEXT_SECRET` signs the forwarded employee context. Rotate the Gateway and Laundry copies together.

Only set `SUPABASE_SERVICE_ROLE_KEY` if a separate server-side administrative operation is approved. It is never shipped to the browser, is not read by the current Gateway or Laundry code, and must not be added to frontend environment files.

The public `SUPABASE_ANON_KEY` belongs only to frontend configuration. It is not server authorization.

## Local development

- Keep `.dev.vars` local and ignored. Use `.dev.vars.example` placeholders.
- A local Supabase project is optional when the Auth Worker fallback is enabled.
- Set `AUTH_FALLBACK_ENABLED=false` to test the Supabase-only path locally.
- Automated tests inject local JWKS and clock fakes; they never call Supabase.

## Frontend configuration and session handling

The browser uses `@supabase/supabase-js` with the PKCE flow, automatic token
refresh, and session detection in the URL. Split the browser application into
three public values and keep every other Supabase credential server-side:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public anon key>
VITE_SUPABASE_REDIRECT_URL=https://<environment-host>/reset-password
```

- Add the exact redirect URL to the Supabase project's allowed redirect list.
  Invitations and password recovery both return to `/reset-password`, where the
  employee sets a password. Public employee signup stays disabled.
- Use a separate Supabase project and redirect URL for local, staging, and
  production. Never copy staging or local values into production.
- The anon key is public and is not authorization. A service-role key or
  `sb_secret_*` key in `VITE_*` configuration is rejected at startup.
- The access token is held in the Supabase client's per-tab `sessionStorage` and sent as
  `Authorization: Bearer <access_token>` to Gateway `/api/*`. Bearer requests use
  `credentials: "omit"` and do not send the legacy CSRF header.
- The Gateway remains authoritative for role, tenant, and hub. The UI never
  derives permissions from JWT claims or client-supplied headers.
- On `401`, refresh failure, or logout the session and access token are cleared,
  synchronization stops, and the login screen explains that sign-in is required.
  On `403` (including revoked or inactive membership) the UI shows an
  access-removed message and requires a new sign-in.
- Local order caches use a separate IndexedDB database per
  employee/tenant/hub scope. Logout or account switching never exposes another
  employee's cached orders, while pending, rejected, and conflicted mutations
  remain stored for the original account and are never flushed without a valid
  session.

Residual risk: tokens kept in browser session storage are exposed to a
successful XSS attack. Keep a strict CSP, avoid unsafe HTML, and do not weaken
this boundary for convenience. Supabase session revocation and the Laundry
membership check limit, but do not eliminate, the window in which a stolen
token may remain valid.

## Open decisions

- Multi-hub staff: the Laundry resolver can select a membership by a validated `hubId`, but the current Gateway does not accept a client-selected hub. It uses the first active membership ordered by `created_at`, then `hub_id`. A staff hub-selection flow still needs approval.
- JWKS cache TTL, clock skew, and the exact Supabase signing algorithms are configurable defaults (`300000` ms, `60` s, `RS256,ES256`); they are not yet validated against a staging project.
- Whether Supabase session revocation must be checked server-side in addition to Laundry membership status remains open.

## Verification checklist

- [ ] Missing, malformed, expired, not-yet-valid, tampered, wrong-issuer, wrong-audience, wrong-algorithm, and unknown-key tokens are rejected.
- [ ] JWKS fetch or parse failures return `503` and never fall back to unverified identity.
- [ ] JWKS refreshes on an unknown `kid` and after the cache TTL.
- [ ] A valid JWT with missing, inactive, or revoked membership is rejected.
- [ ] Client-supplied role, tenant, hub, email, employee, internal-context, and service headers are ignored.
- [ ] Bearer requests do not require CSRF; cookie fallback requests still do.
- [ ] Protected API requests resolve membership on every request.
- [ ] Staging is validated separately with a dedicated Supabase project before production approval.

## Rollback

- Disable the Supabase path by restoring the previous approved Gateway deployment and identity flow only with explicit approval.
- Revoke Supabase sessions and disable employee memberships in Laundry D1.
- No business data needs to be migrated back because Supabase never stores it.
- Do not re-enable the Auth Worker fallback in staging or production as an incident shortcut.

## Troubleshooting

| Symptom | Check |
|---|---|
| `401 invalid_token` | Token is malformed, has the wrong issuer/audience/algorithm, fails signature verification, or references an unknown key |
| `401 expired_session` | Access token expired; refresh through Supabase and retry |
| `503 identity_provider_unavailable` | JWKS retrieval/parsing failed or Laundry service credentials are missing or rejected |
| `403 membership_missing` | No active employee row for the verified `sub`, or no hub membership |
| `403 membership_inactive` | Employee status is `inactive` or `revoked` |
| `403 cross_tenant_denied` | Requested hub is not one of the employee's memberships |
| `/auth/login` returns `404` | The legacy fallback is disabled in staging/production, which is expected |
