# ADR-010: Offline Requirement

**Status:** Proposed Phase 1 — pending business confirmation
**Date:** 2026-11-11

## Context

The architecture document assumes an offline-first front desk with IndexedDB and a pending mutation queue. The master prompt requires offline-first semantics but also says not to invent business rules.

## Decision

Design for offline-first order creation and editing, but do not finalize the user experience or acceptance criteria until the business confirms that offline operation is required. If offline is not required, the mutation queue may be reduced to a server-first read cache.

## Consequences

- The plan includes IndexedDB stores, mutation queue, conflict handling, and recovery.
- Scope and test effort depend on the confirmation.
- No offline customer creation is assumed until OPEN-008 is answered.

## Alternatives

- Server-first only: possible if the business confirms connectivity is reliable.

## References

- `specs/plan.md` OPEN-001 and OPEN-008
- `specs/tasks.md` T-070 through T-073
