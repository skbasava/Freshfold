# Invalid Google Sync Token Runbook

**Scope:** Google Calendar polling returns HTTP `410 Gone`, invalidating the stored `sync_state.sync_token`.

**Status:** Implemented behavior in local/test; no production 410 drill has been performed.

## Detection

- Calendar poller logs `calendar_sync_token_invalid`.
- Metric `calendar_sync_token_reset_count` increments.
- The poller starts a full resync (`sync_state.recovery_state = 'full_sync'`).
- Manager edits made while the token was invalid may be missing until reconciliation runs.

## Diagnosis

1. Confirm the event and environment in Calendar Worker logs:

```bash
pnpm exec wrangler tail <calendar-worker> --config workers/calendar/wrangler.jsonc --format pretty
```

2. Inspect the sync state (the token itself is not a customer secret but do not paste it into tickets):

```bash
pnpm exec wrangler d1 execute <laundry-database> --remote \
  --config workers/laundry/wrangler.jsonc \
  --command "SELECT calendar_id, hub_id, last_polled_at, last_full_sync_at, recovery_state, last_error, updated_at FROM sync_state"
```

3. Check whether the 410 is isolated or repeated. Repeated resets can indicate a deleted/recreated calendar or multiple pollers fighting over the same calendar.

## Mitigation

- Let the automatic full resync run. The poller must process every page before persisting the next sync token.
- Run reconciliation if manager edits may have been missed:

```bash
# Nightly cron: 0 18 * * * UTC. Trigger the same code path through an approved
# scheduled invocation or wait for the next run; do not hand-edit calendar events.
```

- Do not manually insert a sync token. A guessed or stale token will fail again.
- If the calendar was recreated, update the non-secret `GOOGLE_CALENDAR_ID` through the approved deployment process and verify the service account still has access.

## Rollback

- Revert a Calendar Worker deployment that introduced repeated 410s.
- Do not delete `sync_state` or D1 order/calendar rows.
- If a full resync causes incorrect writes, stop the poller cron only with incident approval and follow `incorrect-projection.md`.

## Escalation

Escalate when any of the following is true:

- More than 3 resets occur in 24 hours.
- Full sync does not complete or repeatedly restarts.
- Manager edits are missing after a full sync and nightly reconciliation.
- Calendar access returns `401`/`403` instead of `410`.

Related: `observability.md`, `google-outage.md`, `incorrect-projection.md`.
