# DLQ Inspection and Replay Runbook

**Scope:** Dead-letter queues `laundry-calendar-dlq` and `laundry-notify-dlq`.

**Status:** Implemented in T-052. Local tests only; no staging or production validation has been performed.

**Observability:** See `observability.md` for the signal table and thresholds. Alerts are log/observability-based; no external paging provider is wired.

## What the DLQ means

A message reaches a DLQ only after the source consumer exhausts its retries (or a configured dead-letter policy routes it). The Scheduler Worker consumes both DLQs, logs a structured `dlq_message` event, and explicitly acknowledges every message. Invalid or poison messages are therefore isolated in the DLQ log stream and are never automatically re-enqueued.

The canonical state remains D1. A DLQ message is a hint, not proof that work failed permanently; the outbox row is authoritative.

## Inspect failed outbox rows

Failed outbox rows are the rows with `outbox.status = 'failed'` (8 attempts exhausted). Inspect through the Scheduler admin route:

```bash
export SCHEDULER_URL="https://<scheduler-host>"
export DLQ_ADMIN_TOKEN="<retrieve-from-secret-store>"

curl --fail-with-body \
  -H "x-admin-token: ${DLQ_ADMIN_TOKEN}" \
  "${SCHEDULER_URL}/internal/dlq/failed?limit=50"
```

The response is `{ "items": [...], "total": <count> }`, ordered by `created_at ASC, id ASC`. Each item includes `id` (outbox id), `hubId`, `orderId`, `destination`, `operation`, `targetVersion`, `attempts`, `lastError`, `createdAt`, and `completedAt`.

For direct D1 read-only inspection:

```bash
pnpm exec wrangler d1 execute laundry-core --remote \
  --command "SELECT id, hub_id, order_id, destination, operation, target_version, attempts, last_error, created_at FROM outbox WHERE status = 'failed' ORDER BY created_at ASC, id ASC LIMIT 50"
```

Do not select or paste customer phone numbers, message contents, or secrets into tickets.

## Replay one outbox row

Replay resets exactly one `failed` row to `pending`, clears the lease and previous error, zeroes `attempts`, sets `next_attempt_at` to the requested time (or now), and clears `completed_at`:

```bash
curl --fail-with-body \
  -X POST \
  -H "x-admin-token: ${DLQ_ADMIN_TOKEN}" \
  -H "content-type: application/json" \
  --data '{"outboxId":"<outbox-id>"}' \
  "${SCHEDULER_URL}/internal/dlq/replay"
```

The response is `{ "replayed": true }` when a failed row was reset. `{ "replayed": false }` means the row was not in `failed` state (already `pending`, `dispatching`, or `done`) or the id does not exist; no state changed.

After replay, the next Scheduler sweep claims the row and re-enqueues it to `laundry-calendar-queue` or `laundry-notify-queue` according to `destination`. Confirm progress by watching the row return to `done` or by using the outbox sweep logs.

## Authorization

Two separate credentials are used:

| Purpose | Credential | Transport |
|---|---|---|
| Caller to Scheduler admin routes | `DLQ_ADMIN_TOKEN` | `x-admin-token` header |
| Scheduler to Laundry internal routes | `SERVICE_TOKEN` | `x-service-token` plus `x-service-name: scheduler`, `x-service-tenant-id: system`, `x-service-hub-id: system` |

Set them as Worker secrets, never in `vars` or source:

```bash
pnpm exec wrangler secret put DLQ_ADMIN_TOKEN --config workers/scheduler/wrangler.jsonc
pnpm exec wrangler secret put SERVICE_TOKEN --config workers/scheduler/wrangler.jsonc
```

`DLQ_ADMIN_TOKEN` is checked with a timing-safe comparison. Missing or wrong values return `401 { "error": "unauthorized" }`. Laundry only accepts `system` or `service` actors for these routes; user actors receive `403 { "error": "forbidden" }`.

## Idempotence

Replay is idempotent by state transition: only a row currently in `failed` is updated. Repeating the same replay request returns `{ "replayed": false }` and changes nothing. A replayed outbox message may still be delivered more than once because queues are at-least-once; consumers reload canonical D1 state and ack stale or duplicate work.

## Audit logs

Both layers emit structured JSON without payload secrets:

- Laundry: `{ "event": "outbox_replayed", "actorId": "<actor>", "outboxId": "<id>", "replayed": <bool> }`.
- Scheduler admin: `{ "event": "dlq_replay", "actorId": "admin:dlq", "outboxId": "<id>", "replayed": <bool> }`.
- Scheduler DLQ consumer: `{ "event": "dlq_message", "queue": "<queue>", "outboxId": "...", "orderId": "...", "destination": "...", "targetVersion": <n>, "attempts": <n> }`.

View live logs:

```bash
pnpm exec wrangler tail laundry-scheduler
```

Logs intentionally omit customer phone numbers, message bodies, and provider credentials.

## Poison message isolation

The Scheduler DLQ handler validates every body against `outboxQueueMessageSchema`. Valid and invalid messages are both acknowledged so the DLQ does not loop on a malformed message. Investigate poison messages from the `dlq_message` logs; if a code or schema fix is required, deploy the fix before replaying the corresponding outbox row.

Do not manually re-send raw DLQ payloads. Replay the authoritative outbox row instead.

## Metrics and alerts

Monitor in the Cloudflare dashboard Queues metrics for both DLQs and the normal queues:

- `laundry-calendar-dlq` depth and message age.
- `laundry-notify-dlq` depth and message age.
- Source queue backlog and consumer error rate.

The Scheduler DLQ consumer emits `dlq_message` and increments `dlq_message_count`; the Scheduler cron emits outbox health metrics (`outbox_pending_count`, `outbox_dispatching_count`, `outbox_failed_count`, `outbox_oldest_pending_age_seconds`) and `outbox_alert` events. T-100 defines the review thresholds in `observability.md`; **alerts are log/observability-based and not connected to an external paging provider.** Queue depth itself remains a Cloudflare platform metric that must be reviewed in the dashboard.

## Escalation

1. Capture `dlq_message` log lines and the failed outbox list.
2. Confirm whether the failure is transient (provider outage) or permanent (invalid payload or code defect).
3. For transient failures, replay one row and watch the queue and outbox status.
4. For permanent failures, fix and deploy the consumer before replaying; keep the row `failed` until then.
5. Record the outbox id, admin actor, timestamps, and outcome in the incident ticket. Never paste secrets or customer message content.
