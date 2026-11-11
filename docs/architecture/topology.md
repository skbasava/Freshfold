# Worker Topology

**Status:** Proposed Phase 1

```
Browser (IndexedDB)
   | HTTPS, secure session cookie
   v
Gateway Worker ---------------------> Auth Worker
   | service binding                    | AUTH_DB (separate D1)
   |
   | service binding
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
| Gateway | Yes | None | Session validation, CSRF, rate limiting, validation, correlation ID, SPA serving, trusted context forwarding |
| Auth | Internal | `AUTH_DB` | Login/logout, password verification, sessions, roles, hub membership, revocation |
| Laundry | Internal | `LAUNDRY_DB` | Orders, customers, `applyChange()`, state machine, capacity, audit, change feed, outbox, Calendar metadata, notification ledger |
| Calendar | Internal | None | Calendar outbox consumer, poller, classification, revert, reconciliation |
| Notifications | Internal | None | Delayed send, re-check, claim, provider call, outcome recording |
| Scheduler | Internal | None | Outbox sweep, lease recovery, reconciliation trigger, health, DLQ alerts |

## Ownership rules

- Only Laundry holds `LAUNDRY_DB`.
- Gateway and Auth never access `LAUNDRY_DB`.
- Calendar and Notifications persist state only through Laundry service bindings.
- Internal Workers are not publicly routable.
- Service-binding targets deploy before callers.
