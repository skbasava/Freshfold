# Architecture Decision Records

**Status:** Proposed Phase 1 records. Not final until the Phase 1 approval gate is passed.

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](ADR-001-master-prompt-precedence.md) | Master prompt overrides the architecture document | Proposed |
| [ADR-002](ADR-002-no-workers-kv.md) | No Workers KV | Proposed |
| [ADR-003](ADR-003-fail-closed-guarded-batch.md) | Fail-closed guarded batch for `applyChange()` | Proposed |
| [ADR-004](ADR-004-calendar-ownership.md) | Real Workspace user owns the Calendar; service account gets writer ACL | Proposed |
| [ADR-005](ADR-005-polling-vs-webhooks.md) | Polling over webhooks for v1 | Proposed |
| [ADR-006](ADR-006-auth-worker.md) | Separate Auth Worker with `AUTH_DB` | Proposed |
| [ADR-007](ADR-007-queue-topology.md) | Queue topology and DLQ | Proposed |
| [ADR-008](ADR-008-timezone.md) | UTC storage and Asia/Kolkata business time | Proposed |
| [ADR-009](ADR-009-no-workflows.md) | Workflows not selected for v1 | Proposed |
| [ADR-010](ADR-010-offline-requirement.md) | Offline requirement pending business confirmation | Proposed |
| [ADR-011](ADR-011-capacity-model.md) | Capacity counted from active orders; no separate reservation table | Accepted |
| [ADR-012](ADR-012-notification-provider.md) | Notification provider and idempotency pending | Proposed |
| [ADR-013](ADR-013-minimal-order-status-model.md) | Minimal six-status order model with hold comments | Accepted |
