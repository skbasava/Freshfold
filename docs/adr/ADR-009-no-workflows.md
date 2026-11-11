# ADR-009: Workflows Not Selected

**Status:** Proposed Phase 1
**Date:** 2026-11-11

## Context

Cloudflare Workflows provides durable multi-step execution, but the v1 workload is covered by an outbox, Queues, and Cron sweeps.

## Decision

Do not use Workflows for v1. Use the transactional outbox, Queues, and Cron for retries and recovery.

## Consequences

- Lower operational complexity.
- Retry orchestration is explicit in application code.
- If retry logic becomes unwieldy, revisit Workflows with a new ADR.

## Alternatives

- Workflows for Calendar or notification pipelines: deferred.

## References

- `prompts/master-prompt.md`
- `specs/plan.md`
