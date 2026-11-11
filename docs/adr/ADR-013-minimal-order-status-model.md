# ADR-013: Minimal Order Status Model and Hold Comments

**Status:** Accepted — approved by the user on 2026-11-11
**Date:** 2026-11-11

## Context

The initial state machine used `created`, `confirmed`, `picked_up`, `ready`, `out_for_delivery`, `delivered`, and `cancelled`. The business requires a smaller operational status set and an explicit hold state that captures why an order is paused.

## Decision

Use these order statuses: `confirmed`, `processing`, `hold`, `out_for_delivery`, `delivered`, and `cancelled`. New orders start as `confirmed`. Remove `created`, `picked_up`, and `ready`.

| Intent | From | To | Notes |
|---|---|---|---|
| `createOrder` | — | `confirmed` | Version 1 |
| `markProcessing` | `confirmed` | `processing` | |
| `placeOnHold` | `confirmed`, `processing` | `hold` | Requires `{ comments: string }` |
| `releaseHold` | `hold` | `processing` | Clears the current hold comment |
| `markOutForDelivery` | `processing` | `out_for_delivery` | |
| `markDelivered` | `out_for_delivery` | `delivered` | Terminal |
| `reschedule` | `confirmed`, `processing`, `hold` | unchanged | Manager-only |
| `cancel` | `confirmed`, `processing`, `hold` | `cancelled` | Manager-only; releases the slot |

`out_for_delivery`, `delivered`, and `cancelled` cannot be rescheduled or cancelled.

Hold comments are mandatory, trimmed, and 1–500 characters. `orders.hold_comment` stores the current comment; full history remains in `order_events.detail_json`. The comment is cleared on `releaseHold` and `cancel`.

Front desk and manager may place and release holds under `update_order_status`.

Active capacity statuses are `confirmed`, `processing`, `hold`, and `out_for_delivery`. Held orders keep their delivery slot.

## Consequences

- `orders` gains a nullable `hold_comment` column.
- Read contracts expose `holdComment`.
- The migration status `CHECK` changes; the local-only laundry database must be recreated because the migration has not been applied remotely.
- Notification semantics are unchanged.
- This amends the business-intent list in `specs/constitution.md` section 3.

## Alternatives

- Keep `created` as a pre-confirmation state: rejected because the business treats a created order as confirmed.
- Store the previous status for hold/resume: rejected because hold always resumes to `processing` and history is already in `order_events`.
- Store hold comments only in event history: rejected because the current hold reason must be visible in order reads.

## References

- `specs/constitution.md` section 3
- `specs/plan.md` sections 4–6
- `specs/tasks.md` T-030
- `migrations/laundry/0001_core.sql`
