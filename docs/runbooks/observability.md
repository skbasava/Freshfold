# Observability, Metrics, and Alert Thresholds

**Scope:** Structured logs and log-derived metrics for the Cloudflare Workers, D1, and Queues in this repository.

**Status:** Implemented in T-100. Signals are emitted as structured JSON through `@laundry/shared` observability helpers and read from Cloudflare Workers observability / `wrangler tail` and Cloudflare queue and D1 metrics. **No external metrics backend or paging provider is configured.** The thresholds below are review criteria for dashboards and log-based alerts; they are not automatically wired to PagerDuty, Slack, email, or any other paging service.

## Log contract

Every application log line is one JSON object:

```json
{
  "level": "warn",
  "event": "mutation_conflict",
  "timestamp": "2026-11-11T04:00:00.000Z",
  "service": "laundry",
  "environment": "staging",
  "requestId": "<request-id>",
  "correlationId": "<request-id-or-correlation-id>",
  "orderId": "<order-id>",
  "code": "VERSION_CONFLICT"
}
```

- `level` is one of `debug`, `info`, `warn`, `error`.
- `event` is a stable name from `OBSERVABILITY_EVENTS` or an existing worker event such as `calendar_queue_message_retried`.
- `timestamp` is ISO-8601 in UTC.
- `requestId` comes from the `x-request-id` header when present and is forwarded Gateway → Laundry. Queue work uses `outboxId`/`orderId` for correlation because it has no HTTP request.
- `correlationId` falls back to `requestId`.

Metrics are emitted as structured log events so no new database, Workers KV namespace, or external metrics service is required:

```json
{
  "level": "info",
  "event": "observability_metric",
  "timestamp": "2026-11-11T04:00:00.000Z",
  "service": "scheduler",
  "metric": "outbox_oldest_pending_age_seconds",
  "value": 420
}
```

## Redaction

`createLogger()` and `redactValue()` recursively redact:

- Keys containing `secret`, `token`, `password`, `apiKey`, `privateKey`, `authorization`, `bearer`, `cookie`, `credential`, `signature`, `csrf`, or `session`.
- Phone keys and E.164/local phone-shaped values (`[REDACTED_PHONE]`).
- Customer names and message/body/content/comment/notes/detail fields (`[REDACTED_CONTENT]` or `[REDACTED_PII]`).
- PEM private keys, bearer/JWT tokens, Google OAuth tokens, Google API keys, and email addresses embedded in values.
- Circular structures and non-finite values.

Do not log request bodies, Authorization headers, Google credentials, provider tokens, phone numbers, or message contents even if the helper would redact them. Redaction is a last line of defence, not permission to log sensitive data.

## Required signals and thresholds

| Signal | Source / event | Metric | Warning threshold | Error threshold | Runbook |
|---|---|---|---|---|---|
| Pending outbox count | Scheduler cron calls Laundry `GET /internal/outbox/health` after each sweep | `outbox_pending_count`, `outbox_dispatching_count` | Any sustained increase across two sweeps | Pending rows not draining for 15 minutes | `queue-backlog.md` |
| Pending outbox age | Same health response; Scheduler emits `outbox_alert` with `code=outbox_pending_age` | `outbox_oldest_pending_age_seconds` | > 300 seconds | > 900 seconds | `queue-backlog.md` |
| Failed outbox rows | Same health response; Scheduler emits `outbox_alert` with `code=outbox_failed` | `outbox_failed_count` | — | >= 1 | `dlq-replay.md` |
| Queue retries | Calendar/Notification queue handlers | `queue_retry_count` + `*_queue_message_retried` events | > 5 in 15 minutes | > 50 in 15 minutes or one message retrying for 30 minutes | `queue-backlog.md` |
| DLQ depth | Cloudflare Queues dashboard metrics | Cloudflare queue depth; no local metric | > 0 for one sweep interval | > 0 for 15 minutes | `dlq-replay.md` |
| DLQ events | Scheduler DLQ consumer | `dlq_message` event + `dlq_message_count` | Any event | Any event with `attempts >= 8` | `dlq-replay.md` |
| Sync-token reset | Calendar poller on Google HTTP 410 | `calendar_sync_token_invalid` + `calendar_sync_token_reset_count` | Any reset | More than 3 resets in 24 hours | `invalid-sync-token.md` |
| Calendar reverts | Calendar poller after a forbidden/rejected edit is reverted | `calendar_revert` + `calendar_revert_count` | > 5 per day | > 20 per day or repeated reverts for one order | `incorrect-projection.md` |
| Reconciliation drift | Nightly reconciliation | `calendar_reconciliation_drift` + `calendar_reconciliation_drift` warning event | Drift > 0 | `unresolved > 0` or drift > 10 in one night | `incorrect-projection.md` |
| Notification failures | Notification consumer | `notification_failure_count` + `notification_outcome_record_failed` | Any transient/retry failure | Any terminal or uncertain outcome, or > 5 failures in 15 minutes | `messaging-outage.md`, `notification-uncertainty.md` |
| Mutation conflicts | Laundry `applyChange` route | `mutation_conflict` + `mutation_conflict_count` | > 10 in 15 minutes | Repeated conflicts for one order or hub | `incorrect-projection.md` |
| Offline pending mutations | Browser sync flush only | `offline_pending_mutations` + `offline_pending_mutation_count` | Unsynced changes older than 15 minutes | Any pending change during a reported data-loss incident | `queue-backlog.md` |
| Capacity rejections | Laundry `applyChange` route (`SLOT_FULL`) | `capacity_rejection` + `capacity_rejection_count` | > 20 in one hour | Repeated rejections for one slot while staff expect availability | `queue-backlog.md` |

**Offline pending mutations are emitted in the browser console, not ingested by a Worker.** They are visible during support sessions and local diagnostics only. Do not claim server-side offline telemetry until a client telemetry endpoint is approved and implemented.

## Where to inspect signals

Workers observability is enabled in each `wrangler.jsonc` (`observability.enabled = true`, `head_sampling_rate = 1`). Use placeholders for environment-specific names:

```bash
pnpm exec wrangler tail <worker-name> --config workers/<worker>/wrangler.jsonc --format pretty
```

Filter for a signal in the Cloudflare dashboard Workers Logs or in the tail stream:

- `event = "outbox_alert"` — scheduler outbox age/failed alerts.
- `event = "dlq_message"` — dead-letter message observed by Scheduler.
- `event = "calendar_sync_token_invalid"` — Google sync token reset.
- `event = "calendar_revert"` — forbidden manager edit reverted.
- `event = "calendar_reconciliation_drift"` — nightly drift alert.
- `event = "notification_failure"` — notification failure metric/log context.
- `event = "mutation_conflict"` — stale `baseVersion` or payload mismatch.
- `event = "capacity_rejection"` — delivery slot full.
- `metric = "outbox_pending_count"` or `metric = "outbox_oldest_pending_age_seconds"`.

Queue depth and message age are Cloudflare platform metrics, not application logs. Inspect them in the Cloudflare dashboard under Queues for `laundry-calendar-queue`, `laundry-notify-queue`, `laundry-calendar-dlq`, and `laundry-notify-dlq`. Wrangler also lists queue definitions:

```bash
pnpm exec wrangler queues list
pnpm exec wrangler queues consumer list <queue-name>
```

D1 error rate, rows read/written, and storage are Cloudflare platform metrics. Inspect them in the dashboard for the staging/production `laundry-core` database; see `d1-errors.md` for read-only diagnostic commands.

## Alert review procedure

1. Confirm the environment from the log record (`environment`) and the Worker config before acting.
2. Group by `requestId`, `correlationId`, `outboxId`, or `orderId`; never group by customer phone or message content.
3. Compare with Cloudflare queue/D1 metrics to distinguish an application backlog from a provider or platform incident.
4. Follow the runbook in the table above.
5. Record the event name, metric value, time window, environment, and outbox/order identifiers in the incident ticket. Do not paste secrets, phone numbers, or message bodies.

## What is not implemented

- No external paging provider, webhook, or on-call integration.
- No external metrics backend, Workers KV, or new database.
- No guaranteed exactly-once delivery of alerts; they are derived from sampled/available logs.
- No production validation of these thresholds; they require review against real traffic.
