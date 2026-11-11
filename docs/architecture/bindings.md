# Binding Matrix

**Status:** Proposed Phase 1

| Worker | D1 | Queues | Service bindings | Static Assets | Secrets |
|---|---|---|---|---|---|
| Gateway | None | None | `AUTH` (legacy local fallback only), `LAUNDRY` | `ASSETS` | Internal context signing key, service token, Supabase project/JWKS configuration |
| Auth | `AUTH_DB` | None | None | None | Legacy/local fallback only; no production identity source |
| Laundry | `LAUNDRY_DB` | `CALENDAR_QUEUE` producer, `NOTIFY_QUEUE` producer | None | None | Internal context verification key, service token for internal callers |
| Calendar | None | `CALENDAR_QUEUE` consumer, `CALENDAR_DLQ` producer | `LAUNDRY` | None | Google service-account private key |
| Notifications | None | `NOTIFY_QUEUE` consumer, `NOTIFY_DLQ` producer | `LAUNDRY` | None | Messaging provider credentials |
| Scheduler | None | Queue producers | `LAUNDRY`, `CALENDAR`, `NOTIFICATIONS` | None | Service token |

## Deploy order

1. Auth
2. Laundry
3. Calendar
4. Notifications
5. Scheduler
6. Gateway

## Rules

- No Worker other than Laundry may declare the laundry D1 binding.
- Gateway must not trust client identity headers.
- Gateway derives identity only from a verified Supabase JWT `sub`, then resolves active employee membership from Laundry D1 through the `LAUNDRY` service binding using `SERVICE_TOKEN`.
- Service bindings do not propagate Cloudflare Access context.
- Staging and production bindings must use separate resources, including separate Supabase projects and JWKS endpoints.
- No secrets in Wrangler configuration or source.
- Gateway rate limiting uses Cloudflare Rate Limiting bindings `LOGIN_RATE_LIMITER` and `MUTATION_RATE_LIMITER`; no KV or external store.
- Bearer-authenticated state-changing `/api/*` requests do not need CSRF. The legacy cookie fallback still requires the `x-csrf-token` header to match the `laundry_csrf` cookie.
- The `laundry_csrf` cookie is intentionally readable by the frontend; the legacy `laundry_session` cookie remains `HttpOnly`.
- The Auth Worker and `AUTH_DB` must not be routed as a production identity source. The Gateway disables that flow in staging and production.
