---
description: Review and design the Cloudflare Laundry ERP
agent: plan
---

Read the complete master prompt in
prompts/master-prompt.md.

Read the architecture document in
docs/laundry-calendar-sync.md.

Execute Phase 0 and Phase 1 only.

Verify Cloudflare and Google API assumptions against official documentation.

Produce:
- Worker topology and D1 ownership
- Atomic applyChange() strategy
- D1 schema proposal
- Offline IndexedDB sync design
- Calendar polling and echo suppression
- Outbox, Queues, Cron and DLQ design
- Authentication and security architecture
- Proposed constitution.md, plan.md and tasks.md

Do not implement application code.
Do not finalize migrations or the write path.
Stop and ask for approval.
