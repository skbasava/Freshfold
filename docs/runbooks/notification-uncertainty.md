# Notification Uncertainty Runbook

Use this runbook when a WhatsApp/SMS send may have been accepted but Laundry did not record a definitive `sent` outcome, or when the notification ledger is stuck in `sending`.

**Observability:** See `observability.md` for the signal table and thresholds. Alerts are log/observability-based; no external paging provider is wired.

## Background

- Laundry owns the durable `notifications` ledger. The Notification Worker claims rows through Laundry internal endpoints and records outcomes after the provider call.
- A timeout without a verified provider idempotency guarantee is stored as `failed` with `last_error = provider_timeout_uncertain`. It is **not** retried automatically and is **not** proof of exactly-once delivery.
- If Laundry cannot record a successful provider outcome and the provider does not support idempotency, the message is acknowledged and the row remains `sending`. The customer may or may not have received it.
- With provider idempotency support, the queue message is retried and the same idempotency key is reused.

Never paste phone numbers, message bodies, provider tokens, or raw provider responses into tickets, logs, or this runbook.

## Detection

Signals:

- Notifications stuck in `sending` for longer than the 5-minute claim lease.
- Rows in `failed` with `last_error` of `provider_timeout_uncertain` or other `*_uncertain` codes.
- Rising `notification_outcome_record_failed` logs and `notification_failure_count` metric.
- Notification DLQ depth greater than zero.
- Customer says they did or did not receive a message while the ledger disagrees.

Read-only inspection (use the correct environment and a placeholder database name):

```bash
pnpm exec wrangler d1 execute <laundry-database> --remote \
  --config workers/laundry/wrangler.jsonc \
  --command "SELECT id, hub_id, order_id, channel, state, attempts, last_error, intended_at, updated_at FROM notifications WHERE state IN ('sending','failed') ORDER BY updated_at ASC LIMIT 50"
```

Do not select `destination` for general support tickets. If a specific operator must confirm a destination, handle it as customer PII and redact it before sharing.

## Diagnosis

1. Confirm the Worker is consuming `laundry-notify-queue` and that `laundry-notify-dlq` depth is not growing.
2. Check whether the selected provider supports idempotency keys. SMS is configured as idempotent; WhatsApp Cloud API is treated as non-idempotent.
3. Inspect `attempts`, `last_error`, and `updated_at`:
   - `sending` older than five minutes: the Worker may have crashed after the provider accepted the message but before recording the outcome.
   - `failed` with an uncertain timeout: delivery is unknown.
   - `pending` with repeated retries: the provider may be rate limited or transiently unavailable.
4. Correlate with provider console delivery logs using the provider message ID when one was stored. Never copy raw provider payloads into application logs.
5. Confirm the order still exists at the relevant version. A reschedule may have superseded the notification; in that case the correct outcome is suppression, not resend.

## Mitigation

### Unknown timeout without idempotency

Do not blindly resend. Resending can duplicate a message that the customer already received.

1. Ask the provider console whether the message was accepted and delivered; use the stored provider message ID if present.
2. If the provider shows no acceptance, an operator may reset the ledger row to `pending` and let the outbox/queue replay path retry:

```sql
UPDATE notifications
SET state = 'pending', last_error = 'operator_retry_after_provider_check', updated_at = <now_ms>
WHERE id = <notification_id> AND state = 'failed';
```

3. If the provider shows acceptance, record the resolution as sent using a controlled admin action or D1 maintenance approved for the environment. Do not invent a provider message ID.

### Stuck `sending` after a crash

1. Wait at least five minutes so the claim lease expires.
2. If the provider has no idempotency guarantee, determine from the provider console whether the message was accepted before allowing a retry.
3. If it was not accepted, reset the row to `pending` as above so the next queue delivery or outbox replay can reclaim it.
4. If it was accepted, do not resend. Resolve the row to `sent` with the real provider message ID.

### Outcome recording outage

If Laundry's internal endpoint is unavailable:

- The provider may have accepted the message.
- With idempotency support, queue retries reuse the same key and are safe.
- Without idempotency, the consumer leaves the row `sending`. Reconcile with the provider before any manual retry.

## Rollback

- Stop or pause the Notification consumer if repeated duplicates are observed.
- Revert the Notification Worker to the previous known-good version.
- Do not delete `notifications` or `outbox` rows; they are the audit trail.
- Re-enable consumption only after the provider and ledger are reconciled.

## Escalation

Escalate when any of the following is true:

- Multiple rows are uncertain for the same provider outage.
- A provider outage exceeds the retry/backoff window.
- DLQ depth is non-zero after controlled replay.
- A customer complaint cannot be reconciled against the provider console.
