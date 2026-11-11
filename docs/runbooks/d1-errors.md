# D1 Errors and Quota Runbook

**Scope:** Cloudflare D1 errors, latency, and quota pressure for `LAUNDRY_DB` (laundry-core) and `AUTH_DB` (laundry-auth).

**Status:** Local/test behavior only; no staging/production quota incident has been exercised.

## Detection

- Laundry or Auth returns `503 database_unavailable` or a 5xx that a Worker logs as a safe error code.
- D1 dashboard shows elevated errors, rows read/written, or storage near the plan limit.
- Failed writes or missing order/outbox/changes rows after an accepted request.
- Reconciliation or outbox health cannot read authoritative state.

## Diagnosis

1. Confirm which database and environment are affected. Only the Laundry Worker may bind `LAUNDRY_DB`; other Workers must use service bindings.
2. Check Cloudflare D1 dashboard metrics for the affected database: query errors, rows read/written, storage, and latency.
3. Run read-only checks with placeholders; do not run ad-hoc writes or drop tables during an incident.

```bash
pnpm exec wrangler d1 list
pnpm exec wrangler d1 execute <laundry-database> --remote \
  --config workers/laundry/wrangler.jsonc \
  --command "SELECT COUNT(*) AS orders, MAX(version) AS max_version FROM orders"
pnpm exec wrangler d1 execute <auth-database> --remote \
  --config workers/auth/wrangler.jsonc \
  --command "SELECT COUNT(*) AS sessions FROM sessions"
```

4. Check Worker logs for the affected request IDs and safe error codes. Do not log SQL parameters that may contain customer data.

```bash
pnpm exec wrangler tail <laundry-worker> --config workers/laundry/wrangler.jsonc --format pretty
```

## Mitigation

- For transient D1 errors, retry the client request; do not manually mutate order rows.
- For a quota/storage limit, reduce non-essential read traffic, stop controlled replays, and contact Cloudflare support or raise the plan. Do not delete audit/history tables to create space without an approved retention decision.
- For write-path failures, keep the outbox and `order_events` intact. A conditional update that affected zero rows is not a successful write; follow the guarded-batch design in ADR-003.
- If Auth is unavailable, users cannot sign in or refresh sessions; keep order data intact and communicate the outage.
- Never disable a Worker or D1 binding as a first response unless the alternative is active data corruption.

## Rollback

- Revert a recent Worker deployment if it introduced the error rate.
- Do not restore a stale D1 backup over live data without an approved plan; doing so can discard accepted orders and outbox work.
- If a migration must be rolled back, follow the approved migration procedure; D1 does not guarantee automatic down migrations.

## Escalation

Escalate when any of the following is true:

- Writes fail for accepted requests or canonical rows are missing.
- D1 remains unavailable beyond one sweep/retry window.
- Storage or quota is near exhaustion.
- Authentication database errors prevent all staff from signing in.

Related: `observability.md`, `queue-backlog.md`, `staging-to-production.md`.
