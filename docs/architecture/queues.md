# Queue Topology

**Status:** Outbox claim/dispatch and Scheduler sweep implemented in T-050; Calendar and Notification queue consumers implemented in T-051; DLQ consumption, inspection, and replay implemented in T-052. Calendar event projection, polling, revert, and reconciliation implemented in T-080–T-084. Notification suppression, durable claim/outcome recording, delayed send handling, and WhatsApp/SMS provider adapters implemented in T-090–T-091.

## Queues

| Queue | Producer | Consumer | DLQ |
|---|---|---|---|
| `laundry-calendar-queue` | Laundry, Scheduler | Calendar | `laundry-calendar-dlq` |
| `laundry-notify-queue` | Laundry, Scheduler | Notifications | `laundry-notify-dlq` |

## Message contract

```json
{
  "outboxId": "string",
  "hubId": "string",
  "orderId": "string",
  "destination": "calendar",
  "operation": "UPSERT_EVENT",
  "targetVersion": 7,
  "mutationId": "string"
}
```

## Delivery rules

- At-least-once delivery; duplicates are expected.
- Consumers explicitly `ack()` or `retry()` every message.
- Consumers reload authoritative state; message payload is a hint.
- Retries use exponential backoff with jitter.
- Exhausted messages go to the matching DLQ.
- DLQ replay is controlled and idempotent.
- `delaySeconds` maximum is 24 hours; longer delays are re-enqueued by the sweeper.
- Message size maximum is 128 KB; keep payloads small.

## Consumer behavior

Calendar and Notification Workers expose a `queue` handler alongside `fetch` and process every Cloudflare batch message through their destination-specific schema.

1. Validate the message against the destination-specific contract; invalid messages or missing `SERVICE_TOKEN` are retried without a reload.
2. Reload authoritative state from Laundry `GET /internal/orders/:id` using service-token headers for the message hub.
3. Ack when canonical order state is current or ahead (stale/duplicate message), and ack when the order no longer exists (404).
4. Retry transient reload failures, malformed canonical responses, and messages whose canonical version is behind `targetVersion`.

The Calendar consumer creates or patches the deterministic Google event after reloading canonical state and `calendar_sync`, persists the returned etag and projected version through Laundry internal endpoints, and marks the outbox operation complete. It treats an insert 409 as an existing event and patches it; 429/5xx provider failures and transient Laundry failures are retried. Logs include only event names, `outboxId`, `orderId`, and safe status/diagnostic fields — never private keys, access tokens, phone numbers, or message contents.

### Notification-specific behavior

The Notification Worker reloads notification state from Laundry `GET /internal/notifications/orders/:id`. That response includes the canonical version, delivery time, `last_notified_delivery_at`, and the customer destination. The consumer suppresses work when canonical state is ahead of `targetVersion` (superseded) or when `delivery_at == last_notified_delivery_at` (duplicate delivery update). A canonical version behind the target is retried.

Laundry owns the durable `notifications` ledger; the Notification Worker never writes D1 directly.

1. `POST /internal/notifications/claim` derives a deterministic idempotency key from hub, order, and target version. It inserts at most one ledger row, then conditionally moves `pending` (or an expired `sending` lease) to `sending`. Losing concurrent/duplicate claims observe `in_progress`, `sent`, `failed`, or `suppressed` and do not send again.
2. Delayed work is derived from the outbox `created_at` plus `NOTIFICATION_DELAY_SECONDS` (0–86,400). A not-yet-due claim returns `not_due`; the consumer re-queues with `retry({ delaySeconds })` instead of sleeping.
3. Provider calls happen only after the claim and outside every Laundry D1 transaction. The adapter receives the ledger idempotency key only when it advertises idempotency support.
4. `POST /internal/notifications/outcome` records `sent`, `retry`, `failed`, or `uncertain`. A sent outcome stores the provider message ID, marks the ledger sent, completes the notification outbox row, and sets `orders.last_notified_delivery_at` only when the order is still at the claimed version. A retry outcome resets the ledger to `pending`; terminal failures become `failed`.
5. Provider failures are classified: 429 is rate-limited (retry with `Retry-After`), 5xx/network errors are transient, other 4xx responses are terminal, and 408/504/abort is a timeout.
6. A timeout without provider idempotency is recorded as `provider_timeout_uncertain`. It is not retried automatically and never claimed as exactly-once. With idempotency support the message may be retried safely. If Laundry cannot record a successful provider outcome, the consumer retries only when the provider supports idempotency; otherwise it leaves the ledger in `sending` for operator reconciliation and logs only the safe failure class.

The adapters live in `@laundry/notification-client` behind a common interface. WhatsApp and SMS selection is configuration-driven (`NOTIFICATION_CHANNEL`); provider credentials come from Cloudflare Secrets (`WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `SMS_API_TOKEN`, `SMS_API_URL`, `SMS_SENDER_ID`). Tests inject fake adapters and never use real credentials.

See `docs/runbooks/notification-uncertainty.md` for uncertain-delivery reconciliation.

## Outbox claim and sweep

`applyChange()` commits outbox rows in the same guarded batch as the order, event, and change rows, so a crash before enqueue leaves durable pending work.

The Laundry Worker claims eligible rows in one D1 batch:

1. Recover expired `dispatching` leases back to `pending` and clear the lease.
2. Conditionally move eligible `pending` rows to `dispatching` with a UUID lease token and 60-second expiry; increment `attempts`.
3. Select the rows carrying the new lease token.

Only rows with `next_attempt_at <= now` and no valid lease are claimable. Completion and failure updates are guarded by the lease token, so an expired worker cannot overwrite a newer claim.

- Backoff starts at 30 seconds, doubles per attempt, and is capped at 15 minutes.
- After 8 attempts the row becomes `failed` and is no longer claimable.
- The Scheduler cron calls Laundry `POST /internal/outbox/sweep` with a signed system context.
- A duplicate sweep after rows are `done` claims nothing; duplicate message delivery remains an at-least-once consumer concern.

## Dead-letter queues and replay

The Calendar and Notification consumers route exhausted messages to `laundry-calendar-dlq` and `laundry-notify-dlq` using their Wrangler `dead_letter_queue` settings. The Scheduler Worker is the sole consumer of both DLQs (`max_batch_size` 10, `max_batch_timeout` 5).

1. The Scheduler validates each DLQ body against `outboxQueueMessageSchema` and logs `dlq_message` with queue, outbox id, order id, destination, target version, and attempts. Payload contents and customer data are not logged.
2. Every message, valid or invalid, is explicitly acked. Poison messages are isolated and are never automatically re-enqueued.
3. The authoritative failed work remains the `outbox` row with `status = 'failed'`. Operators inspect rows through Scheduler `GET /internal/dlq/failed`, which calls Laundry `GET /internal/outbox/failed`.
4. Controlled replay uses Scheduler `POST /internal/dlq/replay`, which calls Laundry `POST /internal/outbox/replay`. Only a row currently in `failed` is reset to `pending` with attempts zeroed, lease and error cleared, and `next_attempt_at` set to now; repeated replay returns `replayed: false`.
5. Admin replay requires `x-admin-token` matching `DLQ_ADMIN_TOKEN` with a timing-safe comparison. Scheduler-to-Laundry calls use `SERVICE_TOKEN` service headers for the `scheduler` service identity.
6. Replay and DLQ handling emit structured audit logs (`outbox_replayed`, `dlq_replay`, `dlq_message`) without secrets or customer message contents.

See `docs/runbooks/dlq-replay.md` for inspection, replay, authorization, metrics, and escalation steps.
