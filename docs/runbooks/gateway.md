# Gateway Runbook

## Architecture

- `workers/gateway` is the public entry point and owns static assets.
- For `/api/*`, it verifies a Supabase `Authorization: Bearer <access_token>` using the project JWKS, then resolves active employee membership through the `LAUNDRY` service binding.
- It forwards `/api/*` to Laundry with an HMAC-signed internal context built from the resolved D1 membership, not from JWT role claims.
- Client-supplied identity headers, cookies, bearer tokens, and service identity headers are stripped before forwarding.
- The Auth Worker proxy is a local/legacy fallback only. It is disabled when `ENVIRONMENT` is `staging` or `production`.

## Request Pipeline

1. `requestId` assigns or echoes `x-request-id`.
2. `/api/*` requires either a verified Supabase bearer token or, outside staging/production, a legacy Auth Worker session through `requireSession`.
3. Supabase verification checks signature, algorithm, issuer, audience, `exp`, `nbf`, `iat`, and clock skew. JWKS is cached for a bounded interval and refreshed on an unknown `kid`.
4. The Gateway calls `POST https://laundry.internal/internal/auth/resolve-membership` with `SERVICE_TOKEN` and `x-service-name: gateway`. Missing, inactive, revoked, or cross-membership access is rejected.
5. State-changing `/api/*` requests using the legacy cookie fallback require CSRF through `requireCsrf`. Bearer-authenticated requests are not ambient browser credentials and skip the CSRF double-submit check.
6. Mutating `/api/*` requests pass through `mutationRateLimit` using the resolved tenant, hub, and employee ID.
7. `signedContext` builds and signs the trusted actor context.
8. `forwardToLaundry` forwards the request and returns `cache-control: no-store`.

`GET /api/me` returns the resolved internal actor context without forwarding to Laundry.

Supabase, JWKS, or Laundry membership failures fail closed. Authentication failures return `401`; membership failures return `403`; JWKS/configuration failures return `503`.

## Read Routes

- `GET /api/customers` and `GET /api/customers/:id`
- `GET /api/orders` and `GET /api/orders/:id`
- `GET /api/orders/:id/events`
- `GET /api/changes`

All read routes require `view_orders`, use the hub from the signed context, and forward to Laundry. Order and customer lists use deterministic `created_at DESC, id DESC` cursor pagination; `limit` defaults to 50 and is capped at 100. The change feed uses `since` (a `changes.id`) and `limit` (default 100, max 200), returns ascending changes with `nextCursor` and `hasMore`, and returns `order: null` for tombstones. Unknown or cross-hub IDs return `404`. Safe `GET` reads do not require CSRF or pass through mutation rate limiting.

## Write Route

`POST /api/orders/apply-change` accepts only verb intents: `createOrder`, `reschedule`, `markProcessing`, `placeOnHold`, `releaseHold`, `markOutForDelivery`, `markDelivered`, and `cancel`. It requires a session, CSRF, mutation rate limiting, and a signed context before forwarding to Laundry's `applyChange()`. `placeOnHold` requires `{ "comments": "..." }` with a trimmed 1–500 character comment. Replay detection uses a canonical SHA-256 payload hash; the same mutation ID with a different canonical payload returns `409 MUTATION_PAYLOAD_MISMATCH`.

Slot-bearing intents must use an active slot that starts in the future and fits within 09:00–20:00 Asia/Kolkata without crossing the local date boundary. Capacity is enforced in the same guarded SQL statement; rescheduling checks capacity excluding the order's current reservation.

Responses:
- `200` with `{ order, replayed }`
- `400` for invalid payloads or unknown intents
- `403` for missing permissions
- `404` for unknown or cross-hub orders
- `409` for version, existing-order, or mutation-payload conflicts
- `422` for invalid transitions, customers, slots, or full slots

## Authentication and CSRF

- Production authentication uses Supabase bearer tokens. The Gateway derives only the verified `sub` from the token; role, tenant, hub, email, and employee identity come from Laundry D1.
- A valid bearer token is mandatory for protected routes in staging and production.
- Bearer-token requests skip CSRF because the token is not an ambient browser credential.
- The legacy Auth Worker fallback keeps the `laundry_csrf` cookie and `x-csrf-token` double-submit check for `POST`, `PUT`, `PATCH`, and `DELETE` requests to `/api/*`.
- Missing or mismatched legacy CSRF values return `403 { "error": "csrf_failed" }`.
- Safe methods (`GET`, `HEAD`, `OPTIONS`) do not require a CSRF header.
- An invalid bearer token never downgrades to the cookie fallback.
- The legacy session cookie remains `HttpOnly`.

## Rate Limiting

- `LOGIN_RATE_LIMITER` limits login attempts by IP and normalized account email.
- `MUTATION_RATE_LIMITER` limits state-changing `/api/*` requests by tenant, hub, and actor.
- Exceeded limits return `429 { "error": "rate_limited" }`.
- Missing bindings allow traffic in non-production and fail closed with `503 { "error": "rate_limit_unavailable" }` in production.
- Cloudflare Rate Limiting is approximate and enforced per Cloudflare location, not globally.
- `namespace_id` values must be unique per Cloudflare account and environment; the configured 10/60 and 120/60 limits are starting defaults.

## Bindings

| Binding | Purpose |
|---|---|
| `AUTH` | Legacy/local Auth Worker service binding; ignored in staging/production |
| `LAUNDRY` | Laundry Worker service binding |
| `ASSETS` | Static assets |
| `SERVICE_TOKEN` | Server-only credential for Laundry membership resolution |
| `INTERNAL_CONTEXT_SECRET` | HMAC key for trusted context, at least 32 characters |
| `INTERNAL_CONTEXT_KEY_ID` | Signing key identifier |
| `SUPABASE_URL` | Supabase project base URL |
| `SUPABASE_JWKS_URL` | Trusted project JWKS endpoint; derived from `SUPABASE_URL` when omitted |
| `SUPABASE_JWT_ISSUER` | Expected token issuer |
| `SUPABASE_JWT_AUDIENCE` | Expected token audience, normally `authenticated` |
| `SUPABASE_JWT_ALGORITHMS` | Comma-separated allow-list, normally `RS256,ES256` |
| `SUPABASE_JWT_CLOCK_SKEW_SECONDS` | Clock skew allowance, default 60 |
| `SUPABASE_JWKS_CACHE_TTL_MS` | Bounded JWKS cache interval, default 300000 |
| `AUTH_FALLBACK_ENABLED` | Local development toggle; never enables fallback in staging/production |
| `LOGIN_RATE_LIMITER` | Cloudflare Rate Limiting binding |
| `MUTATION_RATE_LIMITER` | Cloudflare Rate Limiting binding |

See `supabase-auth.md` for project, redirect URL, signing key, and secret setup.

## Errors

- Validation failures return `400` with a field path and message; no stack traces.
- Unauthenticated requests return `401`; Supabase token failures include an auth error code.
- Membership and legacy CSRF failures return `403`.
- Missing upstream bindings, JWKS failures, and membership-resolver configuration failures return `503`.
- Unhandled errors are logged with the request ID and return a generic `500`.

## Local Checks

```bash
pnpm test tests/integration/csrf.test.ts tests/integration/rate-limit.test.ts
pnpm check
pnpm exec wrangler deploy --dry-run --config workers/gateway/wrangler.jsonc
```
