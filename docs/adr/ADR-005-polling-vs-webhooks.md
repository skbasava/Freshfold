# ADR-005: Polling vs Webhooks

**Status:** Proposed Phase 1
**Date:** 2026-11-11

## Context

Google Calendar supports push notifications, but webhooks require a public callback, domain verification, channel renewal, and additional operational handling. The architecture document proposes polling every minute.

## Decision

Use incremental polling with `syncToken` every minute for v1. Evaluate webhooks later if volume or latency requires it.

## Consequences

- No public callback endpoint is required.
- Sync token lifecycle, 410 recovery, and pagination must be robust.
- One-minute polling consumes Google quota; monitor per-project and per-user limits.
- Manager edits may take up to one polling interval to reach D1.

## Alternatives

- Webhooks: deferred due to callback and channel lifecycle complexity.
- Longer polling interval: possible if quota or latency trade-offs require it.

## References

- https://developers.google.com/calendar/api/guides/sync
- https://developers.google.com/workspace/calendar/api/guides/quota
- `specs/plan.md`
