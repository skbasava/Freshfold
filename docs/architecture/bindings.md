# Binding Matrix

**Status:** Proposed Phase 1

| Worker | D1 | Queues | Service bindings | Static Assets | Secrets |
|---|---|---|---|---|---|
| Gateway | None | None | `AUTH`, `LAUNDRY` | `ASSETS` | Internal context signing key, service token |
| Auth | `AUTH_DB` | None | None | None | Password pepper if used |
| Laundry | `LAUNDRY_DB` | `CALENDAR_QUEUE` producer, `NOTIFY_QUEUE` producer | None | None | Internal context verification key |
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
- Service bindings do not propagate Cloudflare Access context.
- Staging and production bindings must use separate resources.
- No secrets in Wrangler configuration or source.
- Gateway rate limiting uses Cloudflare Rate Limiting bindings `LOGIN_RATE_LIMITER` and `MUTATION_RATE_LIMITER`; no KV or external store.
- Gateway state-changing `/api/*` requests require the `x-csrf-token` header to match the `laundry_csrf` cookie.
- The `laundry_csrf` cookie is intentionally readable by the frontend; the `laundry_session` cookie remains `HttpOnly`.
