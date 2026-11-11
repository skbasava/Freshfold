# ADR-011: Capacity Model

**Status:** Accepted — implemented in T-032
**Date:** 2026-11-11

## Context

Capacity must be enforced atomically. The master prompt allows a `delivery_reservations` table "if justified." A separate reservation ledger duplicates `orders.delivery_slot_id` and risks inconsistent state.

## Decision

Use `orders.delivery_slot_id` as the single reservation record. Count capacity from active orders inside the guarded statement. Do not create a separate `delivery_reservations` table in v1.

## Consequences

- One source of truth for slot assignment.
- Capacity checks are atomic with the order mutation.
- Cancellation releases capacity by changing status.
- Historical slot occupancy requires an append-only history table later, not a second live reservation source.

## Alternatives

- Separate `delivery_reservations` table: rejected for v1 because it duplicates state.
- Application-level mutex: rejected because it is not durable or cross-isolate.

## References

- `specs/plan.md` section 6
- `specs/tasks.md` T-032
