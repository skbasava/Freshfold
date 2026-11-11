# ADR-001: Master Prompt Precedence

**Status:** Proposed Phase 1
**Date:** 2026-11-11

## Context

`prompts/master-prompt.md` and `docs/laundry-calendar-sync.md` disagree on several points, including Google Calendar ownership, whether managers may resize events, and the required transaction strategy.

## Decision

`prompts/master-prompt.md` is authoritative. Where it conflicts with `docs/laundry-calendar-sync.md`, the master prompt wins and the deviation is recorded in an ADR.

## Consequences

- Google Calendar ownership follows the verified user-owned model, not the service-account-owned baseline.
- Manager edits accept start-time moves only, not resizes.
- The fail-closed guarded batch is required unless a verified alternative is proven.
- The TV display module remains out of scope.

## Alternatives

- Treat the architecture document as authoritative: rejected because the master prompt explicitly overrides it.
- Merge both documents without a precedence rule: rejected because it leaves conflicts unresolved.

## References

- `prompts/master-prompt.md`
- `docs/laundry-calendar-sync.md`
- `specs/plan.md`
