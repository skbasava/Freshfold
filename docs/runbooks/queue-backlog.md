# Queue Backlog Runbook

**Scope:** `laundry-calendar-queue`, `laundry-notify-queue`, their DLQs, and the outbox sweeper.

**Status:** Local/test behavior only; no staging/production backlog drill has been performed.

## Detection

- `outbox_pending_count`/`outbox_dispatching_count` or `outbox_oldest_pending_age_seconds` rise above thresholds in `observability.md`.
- `outbox_alert` with `code=outbox_pending_age` (warning > 300s, error > 900s).
- Queue depth or message age rises in the Cloudflare Queues dashboard.
- `queue_retry_count` rises for the calendar or notification queue.
- Browser sync shows unsynced changes; support can observe the local `offline_pending_mutations` log.

## Diagnosis

1. Confirm which queue is backed up and which environment it belongs to.
2. Inspect platform queue metrics for depth, oldest message age, consumer error rate, and DLQ depth.
3. Read the outbox health snapshot:

```bash
# Called by the Scheduler cron; to inspect manually, use a signed system/service request.
curl --fail-with-body \
  -H "x-service-token: <service-token>" \
  -H "x-service-name: scheduler" \
  -H "x-service-tenant-id: system" \
  -H "x-service-hub-id: system" \
  "https://<laundry-internal-host>/internal/outbox/health?now=<epoch-ms>"
```

4. Inspect failed outbox rows only when the backlog is not draining:

```bash
pnpm exec wrangler d1 execute <laundry-database> --remote \
  --config workers/laundry/wrangler.jsonc \
  --command "SELECT id, hub_id, order_id, destination, operation, target_version, attempts, last_error, created_at FROM outbox WHERE status IN ('pending','dispatching','failed') ORDER BY created_at ASC LIMIT 50"
```

Do not select customer phone numbers or message contents.

5. Check whether the Scheduler cron is running and whether sweeps log `outbox_sweep_completed`. Cron propagation can take up to 15 minutes.

## Mitigation

- For a provider outage, allow retries/backoff to work; do not replay aggressively.
- For a stuck sweeper or expired leases, wait for the next minute sweep so expired `dispatching` leases return to `pending`.
- For a consumer mistake that exhausted retries, fix/deploy the consumer before replaying failed rows.
- For a genuine one-row failure, use the controlled replay in `dlq-replay.md`.
- For offline pending mutations, ask the user to keep the tab open and reconnect; do not claim pending orders are server-confirmed.

## Rollback

- Revert a consumer or sweeper deployment that caused the backlog.
- Do not delete outbox, notification, or change-feed rows to clear a backlog.
- Disable controlled replay if it increases queue pressure.

## Escalation

Escalate when any of the following is true:

- Oldest pending outbox age exceeds 15 minutes.
- Failed outbox rows or DLQ depth do not fall after provider recovery and controlled replay.
- The backlog affects customer notifications or calendar correctness during business hours.
- Offline clients are holding unsynced changes that may be lost.

Related: `observability.md`, `google-outage.md`, `messaging-outage.md`, `dlq-replay.md`.
