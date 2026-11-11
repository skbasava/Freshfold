# ADR-008: Timezone Handling

**Status:** Proposed Phase 1
**Date:** 2026-11-11

## Context

The business operates in `Asia/Kolkata`, while D1, Cron, and Google Calendar timestamps have different timezone semantics.

## Decision

Store all timestamps in UTC epoch milliseconds. Perform business-time validation, slot generation, and display logic in `Asia/Kolkata`. Cron expressions are evaluated in UTC and documented with their IST equivalents.

## Consequences

- Database comparisons and indexes use UTC integers.
- Slot boundaries and business hours require explicit timezone conversion.
- Tests must cover DST-free Asia/Kolkata behaviour and UTC/IST date boundaries.

## Alternatives

- Store local time: rejected because it complicates ordering, indexing, and cross-timezone correctness.
- Store ISO strings only: possible, but integer epoch milliseconds are simpler for D1 comparisons.

## References

- `specs/plan.md`
- `specs/constitution.md`
