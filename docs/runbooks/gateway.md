# Gateway Runbook

## Architecture

- `workers/gateway` is the public entry point and owns static assets (`ASSETS`).
- For `/api/*`, it verifies a Supabase `Authorization: Bearer <access_token>` using the project JWKS, then resolves staff authorization (`role`, `tenantId`, `hubId`, status, display name) directly from verified `app_metadata` / Custom Access Token Auth Hook claims (`ADR-015`).
- It forwards `/api/*` to Laundry (`LAUNDRY` service binding) with an HMAC-signed internal context built from those verified server claims (`INTERNAL_CONTEXT_SECRET`).
- Client-supplied identity headers, cookies, bearer tokens, and service identity headers are stripped before forwarding.
- There is no Auth Worker proxy, no `/auth/*` route, no session cookie, and no CSRF double-submit check.

## Request Pipeline

1. `requestId` assigns or echoes `x-request-id`.
2. `/api/*` requires a verified Supabase bearer token through `requireSession`.
3. Supabase verification checks signature, algorithm, issuer, audience, `exp`, `nbf`, `iat`, and clock skew. JWKS is cached for a bounded interval and refreshed on an unknown `kid`.
4. `resolveSupabaseAuthorization` extracts `role`, `tenantId`, `hubId`, status, and display name from verified `app_metadata` / hook claims (ignoring `user_metadata` and built-in `"authenticated"`). Missing claims return `403 membership_missing`; inactive/revoked claims return `403 membership_inactive`.
5. Mutating `/api/*` requests pass through `mutationRateLimit` using the resolved tenant, hub, and actor ID.
6. `signedContext` builds and signs the trusted actor context (`x-internal-context` + signature).
7. `forwardToLaundry` forwards the request and returns `cache-control: no-store`.

`GET /api/me` returns the canonical `SessionResponse` (`user`, `hub`, `today`) derived from the verified Supabase session without calling Laundry.

Supabase or JWKS failures fail closed: authentication failures return `401`; missing/inactive authorization claims return `403`; JWKS/configuration failures return `503` (and log safe diagnostics without exposing tokens or secrets).

## Read Routes

- `GET /api/customers` and `GET /api/customers/:id`
- `GET /api/orders` and `GET /api/orders/:id`
- `GET /api/orders/:id/events`
- `GET /api/changes`

All read routes require `view_orders`, use the hub from the signed context, and forward to Laundry. Order and customer lists use deterministic `created_at DESC, id DESC` cursor pagination; `limit` defaults to 50 and is capped at 100. The change feed uses `since` (a `changes.id`) and `limit` (default 100, max 200), returns ascending changes with `nextCursor` and `hasMore`, and returns `order: null` for tombstones. Unknown or cross-hub IDs return `404`. Safe `GET` reads do not pass through mutation rate limiting.

## Write Route

`POST /api/orders/apply-change` accepts only verb intents: `createOrder`, `reschedule`, `markProcessing`, `placeOnHold`, `releaseHold`, `markOutForDelivery`, `markDelivered`, and `cancel`. It requires a verified bearer session, mutation rate limiting, and a signed context before forwarding to Laundry's `applyChange()`. `placeOnHold` requires `{ "comments": "..." }` with a trimmed 1–500 character comment. Replay detection uses a canonical SHA-256 payload hash; the same mutation ID with a different canonical payload returns `409 MUTATION_PAYLOAD_MISMATCH`.

Slot-bearing intents must use an active slot that starts in the future and fits within 09:00–20:00 Asia/Kolkata without crossing the local date boundary. Capacity is enforced in the same guarded SQL statement; rescheduling checks capacity excluding the order's current reservation.

Responses:
- `200` with `{ order, replayed }`
- `400` for invalid payloads or unknown intents
- `403` for missing permissions
- `404` for unknown or cross-hub orders
- `409` for version, existing-order, or mutation-payload conflicts
- `422` for invalid transitions, customers, slots, or full slots

## Rate Limiting

- `MUTATION_RATE_LIMITER` limits state-changing `/api/*` requests by tenant, hub, and actor.
- Exceeded limits return `429 { "error": "rate_limited" }`.
- Missing bindings allow traffic in non-production and fail closed with `503 { "error": "rate_limit_unavailable" }` in production.
- Cloudflare Rate Limiting is approximate and enforced per Cloudflare location, not globally.

## Bindings

| Binding | Purpose |
|---|---|
| `LAUNDRY` | Laundry Worker service binding |
| `ASSETS` | Static assets |
| `INTERNAL_CONTEXT_SECRET` | HMAC key for trusted context, at least 32 characters |
| `INTERNAL_CONTEXT_KEY_ID` | Signing key identifier |
| `SUPABASE_URL` | Supabase project base URL |
| `SUPABASE_JWKS_URL` | Trusted project JWKS endpoint; derived from `SUPABASE_URL` when omitted |
| `SUPABASE_JWT_ISSUER` | Expected token issuer |
| `SUPABASE_JWT_AUDIENCE` | Expected token audience, normally `authenticated` |
| `SUPABASE_JWT_ALGORITHMS` | Comma-separated allow-list, normally `RS256,ES256` |
| `SUPABASE_JWT_CLOCK_SKEW_SECONDS` | Clock skew allowance, default 60 |
| `SUPABASE_JWKS_CACHE_TTL_MS` | Bounded JWKS cache interval, default 300000 |
| `MUTATION_RATE_LIMITER` | Cloudflare Rate Limiting binding |

See `supabase-auth.md` for project, claim, signing key, and secret setup.

## Errors

- Validation failures return `400` with a field path and message; no stack traces.
- Unauthenticated requests return `401`; Supabase token failures include an auth error code.
- Missing/inactive staff claim or permission failures return `403`.
- Missing upstream bindings, JWKS failures, or missing auth/context configuration return `503`.
- Unhandled errors are logged with the request ID and return a generic `500`.

## Local Checks

```bash
pnpm exec vitest run tests/integration/supabase-gateway-auth.test.ts tests/integration/rate-limit.test.ts
pnpm check
pnpm exec wrangler deploy --dry-run --config workers/gateway/wrangler.jsonc
```
