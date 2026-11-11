# ADR-006: Separate Auth Worker

**Status:** Proposed Phase 1
**Date:** 2026-11-11

## Context

The Gateway must not hold the laundry D1 binding. Authentication needs persistent sessions, roles, and hub membership. The master prompt allows a separate Auth Worker if justified.

## Decision

Use a separate Auth Worker with its own `AUTH_DB`. The Gateway verifies sessions through a service binding and forwards a signed internal context to the Laundry Worker.

## Consequences

- The Gateway remains D1-free.
- The Auth database is separate from order data.
- Service-to-service calls require signed context and secret rotation.
- An external identity provider may replace local passwords later through a new ADR.

## Alternatives

- Sessions in the laundry D1: rejected because it violates the single-owner and separation goals.
- Cloudflare Access: possible, but the business identity model is not yet specified.

## References

- `prompts/master-prompt.md`
- `specs/plan.md`
