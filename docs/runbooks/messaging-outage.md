# Messaging Provider Outage Runbook

**Scope:** WhatsApp/SMS provider outages affecting `laundry-notifications`.

**Status:** Local/test behavior only; no production provider outage drill has been performed.

## Detection

- `notification_failure_count` increasing, with `notification_queue_message_retried` reasons of `provider_retry`, `provider_terminal`, or `provider_timeout`.
- `notification_outcome_record_failed` means the provider may have accepted a message but Laundry could not record the outcome.
- Notifications stuck in `pending`/`sending`; notification DLQ depth greater than zero.
- Customers report missing or duplicate messages.

## Diagnosis

1. Check the provider status page/console for the selected channel (`WHATSAPP_API_TOKEN` or SMS provider). Never paste tokens or raw provider payloads.
2. Confirm the configured channel and delay are the intended non-secret values:

```bash
pnpm exec wrangler tail <notifications-worker> --config workers/notifications/wrangler.jsonc --format pretty
```

3. Inspect the notification ledger without selecting destinations:

```bash
pnpm exec wrangler d1 execute <laundry-database> --remote \
  --config workers/laundry/wrangler.jsonc \
  --command "SELECT id, hub_id, order_id, channel, state, attempts, last_error, intended_at, updated_at FROM notifications WHERE state IN ('pending','sending','failed') ORDER BY updated_at ASC LIMIT 50"
```

Do not select `destination` for general tickets; treat it as customer PII.

4. Confirm whether the provider supports idempotency. SMS is configured as idempotent; WhatsApp is treated as non-idempotent. If unsure, follow `notification-uncertainty.md` and do not resend.

## Mitigation

- For transient `429`/`5xx`/network failures, allow queue retries and `Retry-After` backoff to run.
- For terminal `4xx` failures, fix configuration or the destination only after confirming the cause; do not retry blindly.
- For an uncertain timeout without idempotency, do not resend. Reconcile with the provider console using the stored provider message ID if present.
- If the provider outage is extended, keep the Notification consumer running so retries and the ledger capture the outage. Pause only if duplicates are actively being sent, using Cloudflare Queues consumer controls in the dashboard.
- If the ledger is stuck `sending` after a crash, follow `notification-uncertainty.md`.

## Rollback

- Revert the Notification Worker to the last known-good deployment if a deployment caused the failures.
- Do not delete notification or outbox rows; they are the audit trail.
- Re-enable consumption only after the provider and ledger are reconciled.

## Escalation

Escalate when any of the following is true:

- Multiple rows are uncertain for the same provider outage.
- A terminal failure pattern affects all messages for one channel.
- Duplicate messages are confirmed.
- Notification DLQ depth is non-zero after provider recovery and controlled replay.

Related: `observability.md`, `notification-uncertainty.md`, `queue-backlog.md`, `dlq-replay.md`.
