# ADR-003: Fail-Closed Guarded Batch

**Status:** Accepted after T-020 spike
**Date:** 2026-11-11

## Context

D1 `batch()` executes statements sequentially. A zero-row conditional `UPDATE` does not raise an SQL error, so the naive pattern can insert audit, change-feed, and outbox rows even when no order was mutated.

D1 trigger behaviour inside `batch()` and `UPDATE ... RETURNING` were not officially verified before the spike.

## Decision

Use a fail-closed guarded batch:

1. The canonical `UPDATE` or `INSERT` is guarded by version, idempotency, and capacity predicates.
2. Every dependent insert selects from `orders` with the new `version` and `last_mutation_id`.
3. Dependent inserts use `INSERT OR IGNORE` backed by unique constraints:
   - `order_events (hub_id, mutation_id)`
   - `changes (hub_id, order_id, version)`
   - `outbox (order_id, destination, operation, target_version)`
4. Inspect `D1Result.meta.changes` on the canonical statement to classify success or rejection.
5. Do not rely on triggers or `RETURNING` for v1.

## T-020 spike results

Executed in the Workers Vitest D1 environment on 2026-11-11:

- A zero-row canonical update left zero audit, change, outbox, and reservation rows.
- Two simultaneous final-slot updates with capacity 1 produced exactly one success and one zero-row rejection across 5 iterations; the slot count never exceeded capacity.
- Replay with the same mutation ID wrote nothing and preserved the stored payload hash.
- The same mutation ID with a different payload hash was detected from the stored event and wrote nothing.
- `INSERT OR IGNORE` plus the unique constraints made create replay and capacity rejection idempotent.
- `AFTER UPDATE` triggers execute inside `batch()`. A trigger-side insert was counted in the canonical statement's `meta.changes` (observed as 2), so trigger side effects break a strict `meta.changes === 1` assumption.
- A `BEFORE UPDATE` trigger using `RAISE(ABORT)` aborted the batch and rolled back the canonical update and dependent insert.
- `UPDATE ... RETURNING` is supported in the tested D1 environment.

## Consequences

- A stale mutation writes no audit, change, outbox, or capacity rows.
- Concurrency safety depends on D1 serialising statements per database.
- Replay safety depends on the unique constraints and `INSERT OR IGNORE`.
- Triggers and `RETURNING` remain available but are not part of the v1 write path because trigger side effects complicate result classification.
- Production `applyChange()` must use the guarded pattern and prove the same tests against the final schema.

## Alternatives

- Trigger-enforced invariants: verified as executable, but rejected for v1 because trigger side effects alter `meta.changes` and add hidden write paths.
- `UPDATE ... RETURNING`: verified as supported but not required for v1; may simplify later version reads.
- Read-count-then-write capacity checks: rejected because they are not atomic.

## References

- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/d1/platform/limits/
- `specs/plan.md`
- `tests/integration/d1/`
