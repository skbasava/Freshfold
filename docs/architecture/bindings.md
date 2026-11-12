# Binding Matrix

**Status:** Active (amended by ADR-015)

| Worker | D1 | Queues | Service bindings | Static Assets | Secrets |
|---|---|---|---|---|---|
| Gateway | None | None | `LAUNDRY` | `ASSETS` | Internal context signing key, Supabase project/JWKS configuration |
| Laundry | `LAUNDRY_DB` | `CALENDAR_QUEUE` producer, `NOTIFY_QUEUE` producer | None | None | Internal context verification key, service token for internal callers |
| Calendar | None | `CALENDAR_QUEUE` consumer, `CALENDAR_DLQ` producer | `LAUNDRY` | None | Google service-account private key, internal service token |
| Notifications | None | `NOTIFY_QUEUE` consumer, `NOTIFY_DLQ` producer | `LAUNDRY` | None | Messaging provider credentials, internal service token |
| Scheduler | None | Queue producers | `LAUNDRY`, `CALENDAR`, `NOTIFICATIONS` | None | Service token |

## Deploy order

1. Laundry
2. Calendar
3. Notifications
4. Scheduler
5. Gateway

## Rules

- No Worker other than Laundry may declare the laundry D1 binding.
- Gateway must not bind D1 and must not trust client identity headers.
- Gateway derives identity (`sub`) and authorization (`role`, `tenantId`, `hubId`, status) exclusively from a verified Supabase JWT (`app_metadata` / Custom Access Token Auth Hook claims; never `user_metadata` or built-in `"authenticated"` roles). There is no `workers/auth` or `AUTH_DB`.
- Service bindings do not propagate Cloudflare Access context.
- Staging and production bindings must use separate resources, including separate Supabase projects and JWKS endpoints.
- No secrets in Wrangler configuration or source.
- Gateway rate limiting uses the Cloudflare Rate Limiting binding `MUTATION_RATE_LIMITER`; no KV or external store.
- `/api/*` requests use `Authorization: Bearer <access_token>` with `credentials: "omit"` and do not use cookies or CSRF headers.
