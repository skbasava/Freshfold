# Cron Schedule

**Status:** Proposed Phase 1

Cron expressions are evaluated in UTC. Business-time logic uses `Asia/Kolkata`.

| Cron (UTC) | IST equivalent | Job |
|---|---|---|
| `* * * * *` | Every minute | Calendar poller |
| `*/1 * * * *` | Every minute | Outbox sweep and lease recovery |
| `0 18 * * *` | 23:30 | Nightly reconciliation |
| `30 18 * * *` | 00:00 | Retention cleanup and health report |

## Rules

- Cron changes may take up to 15 minutes to propagate.
- Poller must not advance the sync token until all pages are processed.
- Sweeper must claim rows atomically and recover expired leases.
- Reconciliation must ingest manager edits before repairing drift.
- Cleanup must not delete rows required by pending outbox or notification work.
