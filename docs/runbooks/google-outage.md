# Google Calendar Outage Runbook

**Scope:** Google Calendar API failures affecting `laundry-calendar` projection, polling, reverts, and reconciliation.

**Status:** Local/test behavior only; no production outage drill has been performed.

## Detection

- Calendar queue retries rise: `queue_retry_count{queue="calendar"}` and `calendar_queue_message_retried` with `reason=projection_failed`, `reload_failed`, or `canonical_version_behind`.
- `calendar_poll_failed` with an HTTP status of `429`, `5xx`, or `0` (network).
- Google Calendar events are late only; orders and D1 writes should continue.
- Calendar DLQ depth rises in the Cloudflare Queues dashboard or Scheduler logs `dlq_message` for `laundry-calendar-dlq`.

## Diagnosis

1. Confirm the environment and time window from the Worker log record (`environment`, `timestamp`).
2. Check the Google Workspace status page for Calendar API incidents. Do not paste credentials or event descriptions into the ticket.
3. Confirm the failure class:

```bash
pnpm exec wrangler tail <calendar-worker> --config workers/calendar/wrangler.jsonc --format pretty
```

Look for `calendar_poll_failed`, `calendar_queue_message_retried`, and `status` values. `429` and `5xx` are retryable; repeated `401`/`403` usually means credentials or calendar sharing changed.

4. Confirm order entry still works by checking Laundry health and a read-only order query. Do not stop order intake because Calendar is down.

```bash
curl --fail-with-body "https://<laundry-internal-host>/health"
pnpm exec wrangler d1 execute <laundry-database> --remote \
  --config workers/laundry/wrangler.jsonc \
  --command "SELECT COUNT(*) AS recent_orders FROM orders WHERE created_at > <cutoff-ms>"
```

## Mitigation

- Let queue retries/backoff run. Calendar and notification work is asynchronous; pending outbox rows remain authoritative in D1.
- Do not manually edit Google events to compensate. The poller treats manager edits as changes to ingest/revert, not as repair.
- If retries exhaust, inspect failed outbox rows with the DLQ runbook; fix the consumer or credentials before replay.
- If Google credentials are involved, rotate only through `secret-rotation.md` and verify with a single controlled call.
- If the outage is long, watch outbox age in `observability.md`; a growing backlog is expected but must eventually drain.

## Rollback

- Revert the Calendar Worker to the last known-good deployment if a deployment caused the failure.
- Do not delete outbox, `calendar_sync`, `sync_state`, or `calendar_repairs` rows.
- After Google recovers, verify the outbox drains and run reconciliation before considering the incident closed.

## Escalation

Escalate when any of the following is true:

- Google reports an extended outage and outbox age exceeds the error threshold.
- Calendar DLQ depth is non-zero after provider recovery and controlled replay.
- `401`/`403` responses persist after credential verification.
- Reverts or reschedules are occurring for healthy orders, suggesting a projector defect rather than a provider outage.

Related: `observability.md`, `queue-backlog.md`, `dlq-replay.md`, `secret-rotation.md`.
