# Worker Topology

**Status:** Active (amended by ADR-015)

```
Browser (IndexedDB + Supabase PKCE session)
   | HTTPS + Authorization: Bearer <jwt>
   v
Gateway Worker ---------------------> Supabase JWKS (authn + authz claims)
   |
   | service binding (HMAC-signed internal context)
   v
Laundry Worker ---------------------> LAUNDRY_DB (sole D1)
   |
   +-- service binding --> Calendar Worker ------> Google Calendar API
   +-- service binding --> Notification Worker --> WhatsApp/SMS API
   +-- service binding --> Scheduler Worker
```

## Responsibilities

| Worker | Public | D1 | Responsibilities |
|---|---|---|---|
| Gateway | Yes | None | Supabase JWT verification (JWKS), claim-based authorization (`role`, `tenantId`, `hubId`), mutation rate limiting, validation, correlation ID, SPA serving, trusted context forwarding |
| Laundry | Internal | `LAUNDRY_DB` | Orders, customers, `applyChange()`, state machine, capacity, audit, change feed, outbox, Calendar metadata, notification ledger |
| Calendar | Internal | None | Calendar outbox consumer, poller, classification, revert, reconciliation |
| Notifications | Internal | None | Delayed send, re-check, claim, provider call, outcome recording |
| Scheduler | Internal | None | Outbox sweep, lease recovery, reconciliation trigger, health, DLQ alerts |

## Ownership rules

- Only Laundry holds `LAUNDRY_DB`.
- Gateway never accesses `LAUNDRY_DB`; Supabase Auth owns all staff identity, session validation, and role/tenant/hub claims (`ADR-015`).
- Calendar and Notifications persist state only through Laundry service bindings.
- Internal Workers are not publicly routable.
- Service-binding targets deploy before callers.
