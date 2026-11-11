# Staging-to-Production Runbook

**Scope:** Promoting reviewed Laundry ERP changes from staging to production.

**Status:** Procedure only; no staging or production deployment has been performed in this repository.

## Preconditions

- The relevant phase gate and approval have been recorded in `specs/tasks.md` or an ADR.
- `pnpm check` passes on the exact commit.
- Every changed Worker passes `wrangler deploy --dry-run`.
- D1 migrations have been reviewed and applied to staging first. Do not apply/finalize production migrations without explicit approval.
- Staging and production use separate D1 databases, queues, DLQs, Google calendars, and messaging credentials.
- No secrets are present in source, `.dev.vars.example`, Wrangler vars, logs, or the diff.

## Detect / diagnose before promotion

```bash
git status --short
pnpm check
pnpm exec wrangler deploy --dry-run --config workers/<worker>/wrangler.jsonc
```

Confirm the target account, environment name, D1 IDs, queue names, and service bindings in the selected `wrangler.jsonc` or environment-specific config. Compare staging and production binding names without printing secret values:

```bash
pnpm exec wrangler deployments list --config workers/<worker>/wrangler.jsonc
pnpm exec wrangler d1 list
pnpm exec wrangler queues list
```

Check staging health and recent observability signals before promoting:

```bash
curl --fail-with-body "https://<staging-worker-or-internal-host>/health"
pnpm exec wrangler tail <staging-worker> --config workers/<worker>/wrangler.jsonc --format pretty
```

## Promotion procedure

1. Freeze unrelated deployments and record the rollback target (last known-good deployment/version per Worker).
2. Apply approved D1 migrations to staging, then production only after the production approval gate.
3. Deploy in dependency order:

```text
Auth → Laundry → Calendar → Notifications → Scheduler → Gateway
```

4. For each Worker, use the environment-specific config and verify health after deploy:

```bash
pnpm exec wrangler deploy --config workers/<worker>/wrangler.jsonc
curl --fail-with-body "https://<worker-or-internal-host>/health"
```

5. Verify one controlled read, one controlled write with a test order/hub approved for the environment, queue consumption, Calendar projection, and a notification via the configured staging/provider sandbox.
6. Watch `outbox_pending_count`, `outbox_oldest_pending_age_seconds`, `queue_retry_count`, `dlq_message`, `notification_failure_count`, `calendar_revert`, and reconciliation drift for at least one full sweep/reconciliation cycle.

## Rollback

- Roll back the Worker that introduced the regression first; service-binding callers must remain compatible with the previous receiver.
- Prefer Wrangler deployment rollback for Worker code. Use the Cloudflare dashboard/`wrangler deployments` history to identify the last known-good version.
- Do not roll back D1 by restoring a stale backup over live data. If a migration caused the incident, stop writes only with incident approval and follow `d1-errors.md`.
- Do not delete queues, outbox rows, notification rows, or audit tables during rollback.
- Re-run health and observability checks after rollback.

## Escalation

Escalate when any of the following is true:

- A production migration affects accepted orders or outbox work.
- A Worker deploy cannot be rolled back cleanly.
- Queue backlog, DLQ depth, or notification uncertainty rises after promotion.
- Staging and production accidentally share a D1 database, queue, calendar, or credential.

Related: `environment-separation.md`, `secret-rotation.md`, `d1-errors.md`, `queue-backlog.md`, `observability.md`.
