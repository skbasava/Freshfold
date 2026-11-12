# ADR-015: Retire Auth Worker and Auth D1 Tables; Use Supabase Auth for Both Authentication and Authorization

**Status:** Accepted — Approved by project owner on 2026-11-12. Production deployment remains separately gated.
**Date:** 2026-11-12
**Deciders:** Project owner
**Related:** ADR-006, ADR-014, `specs/constitution.md` §1, §2 and §13

## Context

Under ADR-014, Supabase Auth provided external staff authentication (`authn`), while staff roles and hub memberships remained in `LAUNDRY_DB` (`employees` and `employee_hub_memberships`) and the legacy Auth Worker (`workers/auth` + `AUTH_DB`) remained as a local fallback.

On 2026-11-12, the project owner directed that:
1. The entire Auth Worker (`workers/auth`) and `AUTH_DB` (`migrations/auth`) be removed completely.
2. Auth-related D1 tables (`employees` and `employee_hub_memberships` in `LAUNDRY_DB`) and Laundry's membership resolution path be removed completely.
3. Supabase Auth serve as the single system for authentication, session validation, and staff authorization (`role`, `tenantId`, `hubId`, status).

## Decision

1. **Remove the Auth Worker and `AUTH_DB`:** `workers/auth`, `migrations/auth`, the Gateway `AUTH` service binding, `/auth/*` fallback routes, and `legacy-auth-client.ts` are removed. There is no cookie/CSRF auth fallback.
2. **Remove auth tables from `LAUNDRY_DB`:** `migrations/laundry/0003_authz.sql` (`employees`, `employee_hub_memberships`), `workers/laundry/src/authz/employees.ts`, and `POST /internal/auth/resolve-membership` are removed. `LAUNDRY_DB` stores only business data (tenants, hubs, customers, delivery slots, orders, audit/outbox/calendar/notification state).
3. **Gateway verifies Supabase JWTs for both `authn` and `authz`:**
   - Every protected request requires `Authorization: Bearer <supabase_access_token>`.
   - Gateway verifies the asymmetric JWT signature (`RS256` or `ES256`) against the project JWKS (`SUPABASE_JWKS_URL`) plus `iss`, `aud`, `exp`, `nbf`, and `iat`.
   - Authorization (`role`, `tenantId`, `hubId`, `status`) is read exclusively from server-controlled claims in the verified JWT (`app_metadata` or Custom Access Token Auth Hook claims: `tenant_id` / `tenantId`, `hub_id` / `hubId`, `role` / `staff_role` / `app_role`, `status`).
   - Client-editable `user_metadata`, Supabase's built-in `role: "authenticated"` claim, and client HTTP identity headers (`x-role`, `x-hub-id`, `x-tenant-id`, etc.) are never trusted for authorization.
   - Missing `role`, `tenantId`, or `hubId` fails closed with `403 membership_missing`. Inactive or revoked status (`app_metadata.status` in `inactive` / `revoked`) fails closed with `403 membership_inactive`.
4. **Canonical `/api/me` contract:** Gateway returns `SessionResponse` (`user`, `hub`, `role`) on `GET /api/me` and forwards signed `InternalContext` to the Laundry Worker on `/api/*` business routes.
5. **Business-data isolation unchanged:** Supabase Auth handles identity, sessions, and staff authorization claims only; orders, customers, delivery schedules, audit events, and outbox rows remain exclusively in Cloudflare D1 (`LAUNDRY_DB`).

## Consequences

### Positive
- Eliminates an entire Worker (`laundry-auth`), a D1 database (`AUTH_DB`), and two D1 authorization tables (`employees`, `employee_hub_memberships`), plus the cross-worker `/internal/auth/resolve-membership` hop on every request.
- Removes legacy cookie/CSRF session code and test surface.
- Single source of truth in Supabase for staff onboarding, deactivation, role assignment, and hub assignment.

### Negative and risks
- Role/hub changes or user deactivation take effect on token refresh/re-login (mitigated by short Supabase access-token TTLs and revoking refresh sessions in Supabase).
- Staff accounts in Supabase must have `app_metadata` (or Custom Access Token Hook claims) populated with `role`, `tenant_id`, and `hub_id` before they can access `/api/*` (missing claims fail closed with `403 membership_missing`).
- Orders and customers in `LAUNDRY_DB` still require matching `tenants` and `hubs` business rows for foreign-key integrity.

