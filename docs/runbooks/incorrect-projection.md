# Incorrect Projection or Calendar Revert Runbook

**Scope:** D1 canonical order state disagrees with the projected Google Calendar event, or forbidden manager edits are being reverted repeatedly.

**Status:** Local/test behavior only; no production projection incident has been exercised.

## Detection

- Nightly reconciliation logs `calendar_reconciliation_drift`, `calendar_reconciliation_conflict`, or `calendar_reconciliation_pending_projection`.
- Metric `calendar_reconciliation_drift` is greater than zero or `unresolved` is greater than zero.
- Calendar poller logs `calendar_revert` or `calendar_reschedule_rejected` frequently; `calendar_revert_count` rises.
- Staff reports the calendar showing a different time/customer than the dashboard, or a manager edit keeps disappearing.

## Diagnosis

1. Identify one affected order and compare D1, `calendar_sync`, and the calendar event. Do not paste customer phone numbers or event descriptions into tickets.

```bash
pnpm exec wrangler d1 execute <laundry-database> --remote \
  --config workers/laundry/wrangler.jsonc \
  --command "SELECT o.id, o.status, o.delivery_at, o.version, s.event_id, s.etag, s.synced_version, s.sync_status FROM orders o LEFT JOIN calendar_sync s ON s.order_id = o.id WHERE o.id = '<order-id>'"
```

2. Inspect recent repairs:

```bash
pnpm exec wrangler d1 execute <laundry-database> --remote \
  --config workers/laundry/wrangler.jsonc \
  --command "SELECT action, outcome, event_id, detail_json, created_at FROM calendar_repairs WHERE order_id = '<order-id>' ORDER BY created_at DESC LIMIT 20"
```

3. Check whether the drift is a pending projection (`order.version > sync.synced_version`) or an unprocessed manager edit (`event.etag` differs from `calendar_sync.etag`). The nightly reconciliation intentionally ingests manager edits before repairing.

4. Check the Calendar Worker logs for `calendar_reschedule_rejected` and `calendar_queue_message_*` reasons.

## Mitigation

- If the order is current but the event is missing/stale, enqueue a controlled repair through the existing reconciliation or internal enqueue path. Do not edit the event by hand.
- If a manager move was legitimate, let the poller ingest it as a D1 reschedule. If it conflicts with a newer front-desk change, the higher D1 version wins and the event is reverted with a reason.
- If repeated reverts indicate a rule defect, stop automated calendar repair with incident approval, preserve `calendar_repairs`, and deploy a fix.
- If notification content may be wrong, follow `notification-uncertainty.md`; never resend blindly.

## Rollback

- Revert the Calendar Worker or projection code to the last known-good deployment.
- Do not delete `calendar_sync`, `calendar_repairs`, order, or outbox rows.
- After rollback, run reconciliation and verify `unresolved = 0` before closing the incident.

## Escalation

Escalate when any of the following is true:

- Drift or unresolved conflicts affect same-day deliveries.
- A manager edit cannot be reconciled within one poll/reconciliation cycle.
- Reverts exceed the daily threshold or repeatedly hit one order.
- Repair logic would require manual D1 mutation; obtain approval and record the exact SQL.

Related: `observability.md`, `google-outage.md`, `invalid-sync-token.md`.
