# Gateway Runbook

## Architecture

- `workers/gateway` is the public entry point and owns static assets.
- It calls `AUTH` through a service binding to verify sessions and proxies `/auth/*`.
- It forwards `/api/*` to the `LAUNDRY` service binding with an HMAC-signed internal context.
- Client-supplied identity headers, cookies, and service identity headers are stripped before forwarding.

## Request Pipeline

1. `requestId` assigns or echoes `x-request-id`.
2. `/api/*` requires a valid session through `requireSession`.
3. State-changing `/api/*` requests require CSRF through `requireCsrf`.
4. Mutating `/api/*` requests pass through `mutationRateLimit`.
5. `signedContext` builds and signs the trusted actor context.
6. `forwardToLaundry` forwards the request and returns `cache-control: no-store`.

`GET /api/me` returns the verified session context without forwarding to Laundry.

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

## CSRF

- Login sets a `laundry_csrf` cookie that is readable by the frontend.
- The frontend must send the cookie value in the `x-csrf-token` header for `POST`, `PUT`, `PATCH`, and `DELETE` requests to `/api/*`.
- Missing or mismatched values return `403 { "error": "csrf_failed" }`.
- Safe methods (`GET`, `HEAD`, `OPTIONS`) do not require a CSRF header.
- The session cookie remains `HttpOnly`.

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
| `AUTH` | Auth Worker service binding |
| `LAUNDRY` | Laundry Worker service binding |
| `ASSETS` | Static assets |
| `INTERNAL_CONTEXT_SECRET` | HMAC key for trusted context, at least 32 characters |
| `INTERNAL_CONTEXT_KEY_ID` | Signing key identifier |
| `LOGIN_RATE_LIMITER` | Cloudflare Rate Limiting binding |
| `MUTATION_RATE_LIMITER` | Cloudflare Rate Limiting binding |

## Errors

- Validation failures return `400` with a field path and message; no stack traces.
- Unauthenticated requests return `401`.
- Authorization and CSRF failures return `403`.
- Missing upstream bindings return `503`.
- Unhandled errors are logged with the request ID and return a generic `500`.

## Local Checks

```bash
pnpm test tests/integration/csrf.test.ts tests/integration/rate-limit.test.ts
pnpm check
pnpm exec wrangler deploy --dry-run --config workers/gateway/wrangler.jsonc
```
