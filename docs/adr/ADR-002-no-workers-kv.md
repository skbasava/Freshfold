# ADR-002: No Workers KV

**Status:** Proposed Phase 1
**Date:** 2026-11-11

## Context

Workers KV is available on Cloudflare but provides eventual consistency and a separate state surface. The master prompt prohibits it.

## Decision

Do not use Workers KV for any purpose, including caching, sessions, configuration, idempotency, or sync state.

## Consequences

- D1 is the sole authoritative store for laundry data.
- Auth sessions live in the separate `AUTH_DB`.
- Short-lived caches must use D1, in-memory Worker state only within a request, or no cache.

## Alternatives

- KV for sessions or read caches: rejected by the master prompt and by the single-source-of-truth requirement.

## References

- `prompts/master-prompt.md`
- `specs/constitution.md`
