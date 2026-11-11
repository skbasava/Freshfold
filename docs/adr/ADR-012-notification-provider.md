# ADR-012: Notification Provider

**Status:** Proposed Phase 1 — pending business confirmation
**Date:** 2026-11-11

## Context

The business may use WhatsApp, SMS, or both. Provider capabilities determine whether exactly-once delivery is possible and how retries work.

## Decision

Design a channel-neutral notification ledger and consumer. Keep provider-specific adapters behind an interface. Do not claim exactly-once delivery unless the selected provider supports idempotency.

## Consequences

- `notifications.channel` supports `whatsapp` and `sms`.
- Idempotency keys are stored and sent when supported.
- Provider timeouts are recorded as uncertain until resolved.
- The final provider, delay, and retry policy require business confirmation.

## Alternatives

- Provider-specific schema: rejected because the provider is not yet selected.

## References

- `specs/plan.md` OPEN-007
- `specs/tasks.md` T-090 and T-091
