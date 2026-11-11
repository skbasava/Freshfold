# ADR-007: Queue Topology and DLQ

**Status:** Proposed Phase 1
**Date:** 2026-11-11

## Context

Calendar and notification work must survive crashes after commit. Cloudflare Queues provide at-least-once delivery, retries, delays, and DLQs, but not exactly-once delivery.

## Decision

Use `calendar-queue` with `calendar-dlq` and `notify-queue` with `notify-dlq`. Dispatch is driven by the transactional outbox and a Cron sweeper. Every consumer is idempotent and reloads authoritative state.

## Consequences

- Duplicate messages are expected and tolerated.
- Deterministic Google event IDs and notification idempotency keys prevent duplicate side effects where supported.
- DLQ depth must be monitored and replayed through a controlled admin path.
- `delaySeconds` is capped at 24 hours; longer delays are re-enqueued.

## Alternatives

- Direct external calls after commit without an outbox: rejected because a crash can lose work.
- Exactly-once assumptions: rejected because Queues are at-least-once.

## References

- https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- https://developers.cloudflare.com/queues/configuration/dead-letter-queues/
- `specs/plan.md`
