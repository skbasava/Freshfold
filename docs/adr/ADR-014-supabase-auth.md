# ADR-014: Supabase Auth as the external staff identity provider

**Status:** Accepted — Phase A approved 2026-11-11; Phase B implementation authorized. Production deployment requires separate approval.
**Date:** 2026-11-11
**Deciders:** Project owner, security and architecture reviewers
**Related:** ADR-006, `specs/constitution.md` §1, §2 and §13

## Context

The current authentication design uses a separate Auth Worker with an `AUTH_DB` for staff users, password hashes, sessions, and hub memberships. The Gateway verifies the session through the `AUTH` service binding and forwards a signed internal context.

The project owner has requested Supabase Auth for staff login, logout, and password reset. Supabase Auth is an external identity provider. The approved constitution currently permits only the Cloudflare runtime and explicitly prohibits external databases and third-party systems. ADR-006 anticipates that an external identity provider may replace local passwords later, but only through a new ADR.

The requested integration was approved as a constitutional amendment in `specs/constitution.md` §13 on 2026-11-11. This ADR is accepted for Phase B implementation. Production deployment remains separately gated.

## Decision

Supabase Auth is adopted under these constraints:

1. Supabase Auth is used only to authenticate staff. It is the identity provider for login, logout, password reset, access tokens, and refresh tokens.
2. Supabase Database, Storage, Edge Functions, and Row Level Security are not used for orders, customers, employees, memberships, audit records, outbox records, or any other business data.
3. The Laundry Worker remains the only owner of `LAUNDRY_DB` and the only authoritative order write path. `applyChange()` is unchanged.
4. Employee authorization remains server-owned. JWT `sub` values map to employee records and hub memberships stored in Laundry D1. The Gateway resolves membership through the Laundry Worker service binding on every protected request; it never trusts client-supplied role, tenant, hub, or employee identifiers.
5. The Gateway verifies Supabase JWT signatures using the project JWKS, including issuer, audience, expiry, not-before, algorithm allow-list, clock skew, key rotation, and key caching.
6. A valid JWT alone does not grant access. Missing, inactive, or revoked employee membership is rejected even while the JWT remains cryptographically valid.
7. The existing Auth Worker and `AUTH_DB` password/session flow are retired after migration, with a documented local-development fallback only if separately approved. They must not become a second production identity source.
8. Offline order mutations remain local and provisional. They are never submitted without a valid authenticated session. Pending, rejected, and conflicted mutations are preserved across session expiry and refresh failure.
9. No Supabase service-role key, JWT signing secret, or private credential is shipped to the browser. Only the public project URL and anon key are exposed.

## Alternatives considered

- **Cloudflare Access / Zero Trust:** provides an edge identity layer but is not a complete staff credential lifecycle for this application, does not own Laundry employee memberships, and would still require a separate authorization source.
- **Existing Auth Worker with `AUTH_DB`:** already implemented, but requires maintaining password hashing, session storage, password reset, and token revocation. It remains a local-development fallback only and is not the selected production identity source.
- **Auth0, Clerk, or WorkOS:** viable managed identity providers, but introduce another vendor and integration surface without a clear advantage over the requested Supabase Auth project.
- **Custom JWT/password service:** rejected because it concentrates credential and session security in application code and duplicates managed identity features.

Supabase Auth is selected because it provides managed staff authentication while keeping all business authorization and data inside the Cloudflare/D1 boundary.

## Invitation, session, and deactivation lifecycle

- An administrator creates employee invitations in Supabase. Public employee signup stays disabled.
- The invited employee sets a password or uses password recovery; email verification and redirect URLs are configured per environment.
- The browser uses Supabase PKCE and short-lived access tokens. The Gateway verifies JWTs with the project JWKS and resolves the employee membership from Laundry D1 on every protected request.
- Logout clears the Supabase session and account-scoped local caches. Account switching must not expose the previous employee's cached business data.
- Employee deactivation disables the Laundry membership, attempts Supabase session revocation, and causes the Gateway to reject subsequent requests even if an old JWT has not expired.
- Session expiry or refresh failure clears the browser session and blocks synchronization. Pending offline mutations remain local and are not silently discarded.

## Migration and rollback

- Phase B creates a dedicated Supabase project per environment, configures allowed redirect URLs and origins, and keeps service-role credentials server-side only.
- Staff are invited or required to reset passwords; existing password hashes are not migrated.
- Employee membership records move to the approved Laundry D1 authorization schema, keyed by verified Supabase `sub`.
- Cutover is feature-flagged at the Gateway. The Auth Worker/AUTH_DB production identity flow is retired after successful migration.
- Rollback restores the previous Gateway deployment and identity flow only with explicit approval. Supabase sessions can be revoked, and no business data needs to be migrated back because Supabase never stores it.
- Production rollout requires staging validation and a separate deployment approval.

## Constitution amendment required

The Phase A amendment recorded in `specs/constitution.md` was approved on 2026-11-11:

- **§1:** add Supabase Auth as a narrowly scoped external identity-provider exception. The exception covers authentication only and does not permit Supabase database, storage, functions, or business-data processing.
- **§2:** replace the Auth Worker/AUTH_DB identity-and-session role with Supabase Auth for production, while retaining the Laundry Worker as the sole owner of order and employee-authorization data. Define the retirement or local-only fallback for `AUTH_DB`.
- **§13:** record the authentication, authorization, JWT/JWKS, session revocation, offline isolation, audit, and architectural-boundary requirements.

No implementation may begin until the amendment and ADR are approved.

## Consequences

### Positive

- Managed password reset, email verification, token refresh, and MFA options without maintaining password cryptography and session storage.
- Standard JWT verification and key rotation through Supabase JWKS.
- Reduced Auth Worker operational surface after migration.
- Employee authorization remains inside the existing Cloudflare/D1 trust boundary.

### Negative and risks

- External identity-provider availability and vendor dependency.
- Supabase anon key is public; security depends on correct JWT verification and server-side membership checks.
- JWT revocation is not instantaneous. Gateway membership checks and short token lifetimes limit exposure, but a revoked employee can retain a valid JWT until expiry unless Supabase session revocation is also enforced.
- Browser token storage increases XSS impact. Prefer in-memory access tokens with PKCE refresh handling; document residual risk.
- Supabase logs and data residency must be reviewed for customer/staff PII and DPDP obligations.
- Migration from Auth Worker passwords is not automatic. Staff must reset passwords or use an approved invitation flow.
- Password-reset redirect URLs and allowed origins must be configured per environment.

## Acceptance criteria

- Constitution amendment and this ADR are approved.
- Gateway rejects missing, malformed, expired, wrong-issuer, wrong-audience, tampered, and unknown-key JWTs.
- Gateway resolves employee membership and role from Laundry D1 for every protected request.
- Cross-tenant and cross-hub access is denied with no data leakage.
- Revoked or inactive employees are denied even with an unexpired JWT.
- Expired sessions and refresh failures clear the client session and block synchronization.
- Offline pending mutations survive session loss and are not submitted without authentication.
- Auth screens use `@freshfold/ui` and existing semantic tokens.
- `applyChange()` and order business logic are unchanged.
- Staging validation uses a dedicated Supabase project and non-production secrets.

## Approval gate

This ADR is **Accepted for Phase B implementation**. Phase A and the constitution amendment were approved on 2026-11-11. Production deployment is not approved and requires a separate explicit gate.
