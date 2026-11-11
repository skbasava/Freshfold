# Supabase Auth Implementation Plan

**Status:** Phase A approved 2026-11-11; Phase B implementation authorized; production deployment separately gated
**Date:** 2026-11-11
**Scope:** Staff authentication, Gateway JWT verification, employee membership resolution, and frontend session handling

## 1. Approval status

Phase A was approved on 2026-11-11. `docs/adr/ADR-014-supabase-auth.md` is accepted for Phase B implementation, and the constitution §13 amendment is approved. The Auth Worker/AUTH_DB retirement or fallback policy remains an implementation decision. Production deployment requires separate approval.

This plan does not modify order business logic, `applyChange()`, capacity, audit, outbox, or queue semantics.

## 2. Goals

- Staff sign in, sign out, and reset passwords through Supabase Auth.
- The Gateway verifies Supabase JWTs and resolves server-owned employee membership.
- Dashboard, orders, deliveries, and customer routes require a valid session and membership.
- Expired sessions, refresh failures, and revoked memberships are handled safely.
- Offline mutations remain local and are never synchronized unauthenticated.
- Auth UI uses `@freshfold/ui` without duplicating tokens or components.

## 3. Non-goals

- Supabase Database, Storage, Edge Functions, or RLS as business-data stores.
- Moving orders, customers, or audit data out of Laundry D1.
- Replacing `applyChange()` or adding a second order write path.
- Social login, MFA, or organization SSO unless separately approved.
- Production deployment in this phase.

## 4. Target architecture

```
Browser (React)
  -> Supabase Auth (login, refresh, password reset)
  -> Gateway Worker
       -> verify Supabase JWT via JWKS
       -> resolve employee membership via LAUNDRY service binding
       -> signed internal context -> Laundry Worker
            -> LAUNDRY_DB (employees, employee_hub_memberships, orders, ...)
```

The browser never receives the Laundry D1 binding or a Supabase service-role key. The Gateway never trusts client role, hub, tenant, or employee headers.

## 5. Configuration and secrets

Frontend public configuration:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_REDIRECT_URL` for password-reset and email-confirmation redirects

Cloudflare secrets/configuration:

- `SUPABASE_URL`
- `SUPABASE_JWKS_URL` or derived JWKS endpoint
- `SUPABASE_JWT_ISSUER`
- `SUPABASE_JWT_AUDIENCE`
- `SUPABASE_SERVICE_ROLE_KEY` only if a server-side administrative operation is explicitly approved; never exposed to the browser
- Existing `INTERNAL_CONTEXT_SECRET`, `INTERNAL_CONTEXT_KEY_ID`, and `SERVICE_TOKEN`

Staging and production must use separate Supabase projects, redirect URLs, and secrets. No local or staging credentials may be used in production.

## 6. Work breakdown

### A. Governance and configuration

- Approve ADR-014 and the constitution amendment.
- Create a Supabase project for staging and production separately.
- Configure email/password authentication, password-reset redirect URLs, allowed origins, and rate limits.
- Document secret rotation and revocation procedures.

### B. Contracts

- Add typed Supabase JWT claim validation schema: `sub`, `email`, `aud`, `iss`, `exp`, `iat`, `nbf`, `role`, and optional `session_id`.
- Add employee membership contracts: employee id, Supabase subject, display name, email, status, tenant/hub memberships, roles.
- Add auth error codes for invalid token, expired session, membership missing, membership inactive, cross-tenant denial, and refresh failure.
- Keep auth contracts separate from order contracts.

### C. Laundry D1 and internal API

- Add an approved migration for:
  - `employees`: id, supabase_subject unique, email, display name, status, created_at, updated_at.
  - `employee_hub_memberships`: employee_id, tenant_id, hub_id, role, created_at, unique employee/hub, foreign keys.
- Preserve the existing role matrix: front desk, manager, service/internal.
- Add internal service-binding endpoints:
  - Resolve active membership by Supabase subject.
  - Optionally list/update employees for manager administration, if approved.
- Return only the actor context required by the Gateway: actor id, role, tenant, hub, and status.
- Revocation and deactivation take effect on the next resolution. Use a short cache TTL only if approved; never cache beyond the configured maximum.
- Do not place employee authorization in Supabase Database or RLS.

### D. Gateway JWT verification

- Replace the Auth Worker session lookup with Supabase JWT verification.
- Fetch and cache JWKS; refresh on unknown `kid` and on a bounded interval.
- Allow only RS256/ES256 (or the exact algorithms configured by Supabase).
- Validate signature, `iss`, `aud`, `exp`, `nbf`, `iat`, and clock skew.
- Reject malformed or missing `Authorization: Bearer` tokens with `401`.
- After cryptographic validation, call Laundry to resolve membership. Reject missing/inactive/revoked membership with `403`.
- Build the existing signed internal context from the resolved membership, not from JWT role claims.
- Keep internal context signing, expiry, and nonce replay protection.
- Protected routes: dashboard data, orders, deliveries, customers, change feed, order events.
- Keep public health endpoints public; keep auth callbacks public only as required.
- Never log JWTs, refresh tokens, service-role keys, or full email/phone payloads.

### E. Frontend

- Add `@supabase/supabase-js` and initialize with PKCE.
- Auth screens using existing `@freshfold/ui` components:
  - Login.
  - Forgot password.
  - Reset password callback.
  - Logout.
- Session bootstrap: read the Supabase session, refresh when needed, then call Gateway `/api/me`.
- Send `Authorization: Bearer <access_token>` to the Gateway; do not send role/hub/tenant headers.
- On refresh failure or invalid session: clear the client session, show the login screen, stop background synchronization, and preserve local pending mutations.
- On revoked membership or `403`: show an access-revoked message, stop synchronization, and preserve local data for resolution.
- Offline mode: allow local order creation/editing only as provisional; queue mutations with stable IDs; do not submit until a valid session and membership exist.
- Do not store Supabase service-role keys or sensitive customer data beyond the existing order cache.
- Reuse FreshFold tokens/components; no duplicate theme or component library.

### F. Auth Worker migration

- Stop issuing new production sessions from the Auth Worker.
- Decide and document one of:
  - Retire `AUTH_DB` after staff migration and password reset.
  - Keep a local-development-only fallback behind an explicit environment flag.
- Do not run both production identity sources concurrently for the same staff account.
- Remove or gate the Auth Worker from production routing after migration.

### G. Tests

Unit and integration:

- JWT: valid, expired, not-yet-valid, tampered signature, wrong issuer, wrong audience, unknown `kid`, key rotation, malformed token.
- Membership: active, missing, inactive, revoked, cross-tenant, cross-hub, role changes.
- Gateway: protected route without token, with expired token, with valid token but revoked membership, with spoofed role/hub headers.
- Laundry internal API: service-binding authorization, hub scoping, no cross-tenant leakage.
- Frontend: login/logout/password reset, session refresh, refresh failure, revoked access, offline mutation preservation and blocked sync.
- Offline: pending mutations survive logout/expiry and are not submitted until re-authentication.
- Regression: `applyChange()` and order behavior unchanged.

End-to-end staging:

- Staff login through Supabase.
- Protected dashboard/orders/deliveries/customers access.
- Membership revocation takes effect on the next request.
- Password reset redirect works.
- Expired refresh token returns to login without losing pending local mutations.

## 7. Rollout

1. Governance approval.
2. Staging Supabase project and secrets.
3. Laundry migration and internal membership API.
4. Gateway JWT verification in staging.
5. Frontend auth screens and API client.
6. Staging E2E and security review.
7. Staff migration/invitation plan and password-reset communication.
8. Production approval and deployment, separately gated.

## 8. Open decisions

- Final Auth Worker/AUTH_DB retirement versus local fallback.
- Whether employee administration remains in Laundry D1 or needs a manager UI in this phase.
- Exact Supabase JWT algorithm(s) and JWKS cache TTL.
- Whether Supabase session revocation must be checked server-side in addition to membership status.
- Token storage approach and XSS mitigations.
- DPDP/data-residency review for Supabase logs and identity data.
- Password-reset email delivery and redirect URLs for each environment.

## 9. Security risks

- External identity-provider outage blocks staff login; offline order entry must remain local but sync must wait.
- JWT revocation latency; mitigate with short-lived access tokens, membership checks, and Supabase session revocation.
- Browser token theft via XSS; use strict CSP, avoid unsafe HTML, and minimize token persistence.
- Public anon key is not a secret; never treat it as authorization.
- Service-role key must remain server-side only.
- Cross-tenant leakage if membership resolution or hub scoping is wrong.
- Migration mistakes could lock out staff; provide a tested recovery path.

## 10. Approval request

Approve ADR-014 and the explicit constitution amendment before implementation. No code, migration, auth provider configuration, or deployment has been performed for this plan.
