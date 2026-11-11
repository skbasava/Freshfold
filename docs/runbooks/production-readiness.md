# Production Readiness Review

**Status:** Review complete — **deployment NOT approved**.
**Date:** 2026-11-11
**Scope:** T-120 review of the Cloudflare-native Laundry ERP in this repository.
**Verdict:** The local implementation and automated evidence are coherent, but this system is **not production-ready** and must not be deployed. Multiple acceptance gates, remote-resource checks, staging integrations, and explicit approvals are still missing.

This document is an honest readiness assessment. It is not a deployment authorization, a claim of production readiness, or a substitute for a security audit, staging smoke test, or business sign-off.

---

## 1. Evidence reviewed

| Evidence | Result |
|---|---|
| Full suite `pnpm check` | Passed: typecheck for root, `apps/web`, and six Workers; **54 test files / 325 tests** |
| Focused E2E suite `pnpm vitest run tests/e2e/production-scenarios.test.ts` | Passed: **10 / 10 scenarios** |
| Existing integration suite | Passed as part of `pnpm check` |
| Dry-run all six Workers | Passed: gateway, auth, laundry, calendar, notifications, scheduler |
| Secret regex scan | 3 hits, all intentional test literals for redaction/authentication tests; no real credential found |
| Remote/deployed resources | Not provisioned, not inspected, not migrated in this review |
| CI workflow | Defined in `.github/workflows/ci.yml`; **not executed in this session** |
| Production deployment | Not performed |

No commit, remote resource creation, remote D1 migration, staging deployment, or production deployment was performed.

---

## 2. Architecture invariants

| Invariant | Review result | Evidence / residual risk |
|---|---|---|
| Cloudflare-only runtime | **Met in configuration** | Workers, D1, Queues, Cron Triggers, service bindings, Secrets, Static Assets, IndexedDB. No prohibited database, KV, broker, or Node server configured. |
| Single `LAUNDRY_DB` owner | **Met** | Only `workers/laundry/wrangler.jsonc` binds the laundry D1 database; Gateway/Auth/Calendar/Notifications/Scheduler use service bindings. |
| Single authoritative write path | **Met in code** | `applyChange()` is the only order mutation path used by HTTP, Calendar reschedule, and tests. |
| Explicit business intents | **Met** | No arbitrary status patch intent; `setStatus` is rejected by contract validation. |
| Atomic mutation with fail-closed guards | **Met locally** | Order, audit, change feed, and outbox rows are committed in one guarded `db.batch()`. D1 integration tests cover zero-row guards, replay, and final-slot contention. |
| Server-owned versions | **Met** | Client `baseVersion` conflicts are preserved; Calendar uses the projected version as its base version. |
| Idempotency | **Met locally** | Stable `mutationId`, canonical payload hash, deterministic Calendar event IDs, and notification ledger idempotency keys. |
| Transactional capacity | **Met locally** | Capacity is enforced in the same conditional statements as order create/reschedule; concurrent final-slot tests pass. No separate reservation table. |
| No external calls inside order transactions | **Met** | Calendar and messaging work runs after commit through durable outbox rows and Queues. |
| At-least-once consumers | **Met locally** | Duplicate queue message and duplicate notification tests pass; consumers reload canonical state. |
| Offline semantics | **Met at data layer** | IndexedDB implementation, optimistic writes, conflict/rejection preservation, multi-tab coordination, and snapshot recovery are tested with an in-memory backend. No real browser/IndexedDB E2E was run. |
| Calendar permissions | **Met locally** | Only start-time moves are accepted; forbidden title/description/color/recurrence/resize/all-day edits are reverted. No real Google ACL or identity attribution was verified. |
| Tenant/hub isolation | **Met locally** | Every business query is hub-scoped; cross-hub and cross-tenant tests exist. |
| Observability and durable failures | **Partially met** | Structured, redacted logs and log-derived metrics exist. No external metrics backend or paging integration exists. |
| FreshFold UI design system | **Partially met (Stage A)** | Stage A added `packages/freshfold-ui` and a mock-backed Dashboard using the constitutional tokens and shell. Orders, Deliveries, Customers, production API integration, and browser responsive/visual-regression tests are still outstanding; this remains a production blocker. |

**Documentation drift:** The ADR index now records Phase 1 approval, but several individual architecture pages and ADRs still describe themselves as "Proposed Phase 1", and some tables drift from current Wrangler configuration (for example, the documented Scheduler service-binding and cron lists are broader than the current config). This does not affect local tests, but it must be reconciled before an operator relies on those documents during an incident.

---

## 3. Security review

| Control | Review result |
|---|---|
| Trusted actor context | Signed internal context or service-token context is resolved at the Laundry boundary; client-supplied actor/role/hub fields are not trusted. |
| Gateway / Auth boundary | Gateway has no D1 binding; Auth owns `AUTH_DB`; Laundry owns order state. |
| RBAC | Manager/front-desk/service permissions are enforced through explicit intents. Front desk cannot cancel or reschedule; tests cover denials. |
| Tenant/hub scope | Business queries and service calls carry explicit hub context; cross-hub reads/writes are rejected in tests. |
| CSRF | Gateway double-submit CSRF middleware and tests exist. |
| Rate limiting | Gateway rate-limit bindings are configured and tested. |
| Replay protection | Internal signed context uses nonce replay guard, `iat`/`exp`, and service tokens; mutation replay uses `mutationId` plus payload hash. |
| SQL injection | Bound parameters are used; no identifier interpolation in order queries. |
| Secret handling | No `.dev.vars` present; `.dev.vars.example` contains placeholders only; Wrangler configs contain no secret values. |
| PII and log redaction | Observability helpers redact secrets, tokens, phone-shaped values, customer content, and private keys. Calendar descriptions contain no phone number or customer name in tests. |
| Calendar attribution | The system does not claim manager identity from Calendar edits; Calendar-sourced events are system-attributed. |

**Findings:** No open critical security defect was identified within the reviewed local scope. This is not an external security audit and does not cover production IAM, Cloudflare account permissions, Google Workspace ACLs, provider account security, dependency CVEs, or operational access control.

**Secret scan result:** Three regex hits were intentional fixtures:

- `tests/unit/notification-client.test.ts` — fake `Bearer` value used to verify header construction.
- `tests/unit/observability.test.ts` — fake PEM private key used to verify redaction.
- `tests/unit/observability.test.ts` — fake JWT used to verify redaction.

No real private key, Google API key, OAuth token, AWS/GitHub/Slack token, WhatsApp token, or live credential was found in the scanned source tree.

---

## 4. Schema, migrations, and rollback

| Item | Status |
|---|---|
| Auth migration `0001_auth.sql` | Present and applied in local/Miniflare tests. |
| Laundry migrations `0001_core.sql`, `0002_indexes.sql` | Present; local migration tests pass from an empty database. |
| Remote D1 migration | **Not applied** and must not be applied without explicit staging/production approval. |
| Migration review approval | **Not recorded**; `migrations/laundry/README.md` still says the schema is not production-final until review approval. |
| Down migrations | Not provided. D1 does not guarantee automatic down migrations. |
| Worker version rollback | Procedure documented; **not executed**. |
| D1 Time Travel restore | **Not tested**. No backup/restore drill has been run. |
| Data retention/archival | Proposed only; not implemented or approved. |
| Staging/production database IDs | Placeholder `00000000-0000-0000-0000-000000000000` values remain; no real IDs are configured. |

**Conclusion:** Migration correctness is proven only against local Miniflare D1. Schema finalization, remote migration, rollback, and restore gates remain open.

---

## 5. Secrets and environment separation

| Item | Status |
|---|---|
| Committed secrets | None found by scan or inspection. |
| `.dev.vars.example` | Placeholders only; no live values. |
| Wrangler vars | Non-secret configuration only (`ENVIRONMENT`, calendar ID placeholder, notification channel/delay). |
| Secret inventory | Auth session secret, internal context secret/key ID, service token, DLQ admin token, Google service-account credentials, WhatsApp credentials, SMS credentials. |
| Per-environment resources | Documented in `docs/runbooks/environment-separation.md`. **Not verified in Cloudflare** because no staging/production resources exist in this review. |
| Staging/production isolation | **Not verified**. Must be proven before production approval. |
| Rotation | Procedure documented; **not exercised**. |

**Risk:** The repository currently deploys to `ENVIRONMENT=development` with placeholder resource IDs. Any remote deployment must use environment-specific configuration and real resource IDs that are reviewed before deployment.

---

## 6. Observability and alerting

| Required signal | Implemented | Caveat |
|---|---|---|
| Outbox pending count/age | Yes, Scheduler health + `outbox_alert` | Log-derived only. |
| Failed outbox rows | Yes | No paging integration. |
| Queue retries | Yes | Log-derived only. |
| DLQ depth/events | Queue dashboard + `dlq_message` | No local metric for platform queue depth. |
| Sync-token resets | Yes | Thresholds unvalidated against real traffic. |
| Calendar reverts | Yes | Thresholds unvalidated. |
| Reconciliation drift | Yes | Unresolved conflicts alert. |
| Notification failures | Yes | Terminal/uncertain evidence recorded. |
| Mutation conflicts | Yes | Log-derived only. |
| Offline pending mutations | Browser console only | Not ingested server-side. |
| Capacity rejections | Yes | Log-derived only. |

**Blocker:** Alerts are **not wired to PagerDuty, Slack, email, or any on-call paging service**. No external metrics backend exists. Thresholds have not been calibrated against staging or production traffic.

---

## 7. Runbooks

The runbook index is `docs/runbooks/README.md`. Reviewed runbooks:

- `google-outage.md`
- `messaging-outage.md`
- `d1-errors.md`
- `queue-backlog.md`
- `invalid-sync-token.md`
- `dlq-replay.md`
- `incorrect-projection.md`
- `notification-uncertainty.md`
- `secret-rotation.md`
- `staging-to-production.md`
- `observability.md`
- `auth.md`
- `gateway.md`
- `environment-separation.md`
- `local-development.md`

Each failure runbook contains detection, diagnosis, mitigation, rollback, and escalation guidance where applicable. Commands use placeholders and avoid secrets/PII.

**Caveat:** Runbooks have not been exercised in a staging incident, game day, restore drill, or production-like environment.

---

## 8. Testing review

### Executed commands

```bash
pnpm check
pnpm vitest run tests/e2e/production-scenarios.test.ts
pnpm exec wrangler deploy --dry-run --config workers/<worker>/wrangler.jsonc --outdir /tmp/laundry-dry-run/<worker>
```

### Results

- `pnpm check`: **54 test files / 325 tests passed**.
- Focused E2E: **10 / 10 passed**.
- Dry-run: all six Workers succeeded.
- Secret regex scan: 3 intentional test-fixture hits, no real secret.

### T-110 scenario coverage

| # | Scenario | Covered by |
|---|---|---|
| 1 | Offline create → reconnect → canonical D1 order | `tests/e2e/production-scenarios.test.ts` through real HTTP apply-change |
| 2 | Creation → exactly one Calendar event | E2E outbox dispatch + Calendar consumer + fake Google |
| 3 | Manager move → D1 reschedule | Calendar poller + fake Google |
| 4 | Forbidden Calendar edit reverted | Calendar poller + fake Google |
| 5 | Failed enqueue recovered by Cron sweeper | Real Scheduler sweeper → Laundry sweep route |
| 6 | Duplicate queue message → one event | Calendar consumer duplicate delivery |
| 7 | Delayed notification suppressed after drag-back | Poller move out/back + notification consumer |
| 8 | Provider timeout without false exactly-once | Notification consumer + fake provider timeout |
| 9 | Full slot rejects competitor | `applyChange()` capacity guard |
| 10 | Nightly reconciliation repairs without overwriting pending manager change | Reconciliation + repair consumer |

### Not tested

- Real Google Calendar API, service-account auth, ACLs, quotas, or staging calendar.
- Real WhatsApp/SMS provider, sandbox, receipts, or idempotency guarantees.
- Remote D1, Queues, Cron, or DLQs.
- CI execution on a clean checkout.
- Browser E2E, real IndexedDB, storage eviction, or visual regression.
- Load, soak, quota, or failure-injection testing.
- Worker rollback, D1 Time Travel restore, or disaster recovery.
- Alert paging or on-call delivery.

---

## 9. Open decisions (OPEN-001 – OPEN-010)

These decisions are tracked in `specs/plan.md`. The implementation follows documented defaults, but **no formal business or architecture approval is recorded for production**. No decision below should be treated as silently resolved.

| ID | Decision | Implementation/default observed | Production status |
|---|---|---|---|
| OPEN-001 | Offline order create/edit required? | Implemented per master prompt; ADR-010 still says business confirmation pending. | Needs explicit confirmation. |
| OPEN-002 | Single hub vs multi-tenant? | Hub-scoped, multi-tenant-ready schema and queries. | Default implemented; formal approval not recorded. |
| OPEN-003 | Slot sizes, capacity, hours, consuming statuses | 2-hour seeds in tests, configurable capacity, 09:00–20:00 Asia/Kolkata, active statuses exclude cancelled/delivered. | Business values not confirmed. |
| OPEN-004 | Who may cancel/refund? | Manager-only cancel; no refund flow. | Refund policy not approved. |
| OPEN-005 | Calendar ownership | Real Workspace owner + service-account writer per ADR-004. | Real Google ownership/ACL not verified. |
| OPEN-006 | Auth provider | Separate Auth Worker with `AUTH_DB`; custom sessions. | Production identity/secret setup not verified. |
| OPEN-007 | WhatsApp, SMS, or both; provider; delay | Both adapters; channel configurable; delay defaults to `0`. | Provider and delay need business confirmation. |
| OPEN-008 | Offline customer creation? | Existing cached customers only; no offline customer-create path. | Needs confirmation. |
| OPEN-009 | Items change after creation? | No item mutation intent; cancel/recreate only. | Needs confirmation. |
| OPEN-010 | One-minute polling acceptable? | Calendar and Scheduler crons run every minute plus nightly reconciliation. | Quota/volume not validated against real usage. |

---

## 10. Deployment gates G1–G7

The task register defines G1–G7 as Phase 1 approval gates. This review did not invent approvals. Current status:

| Gate | Condition | Status |
|---|---|---|
| G1 | Constitution, plan, and tasks reviewed | **Not satisfied** — documents still identify themselves as proposed; no approval record. |
| G2 | Open decisions answered or explicitly deferred | **Not satisfied** — defaults exist, but explicit decisions are not recorded. |
| G3 | D1 transaction strategy approved for spike | **Not satisfied** — ADR-003 exists; approval not recorded. |
| G4 | D1 schema approved for migration authoring | **Not satisfied** — schema review/production-final approval not recorded. |
| G5 | Authoritative write path approved for implementation | **Not satisfied** — implementation exists; approval not recorded. |
| G6 | Phase 2 implementation approved | **Not satisfied** — no approval record. |
| G7 | Production deploy approved separately | **Not satisfied** — explicitly not requested or granted. |

---

## 11. Blockers and unverified items

Production approval is blocked by all of the following:

1. **No explicit production approval** has been recorded.
2. **G1–G7 are not satisfied**; the constitution, plan, tasks, schema, and write path still lack recorded approvals.
3. **Real Google Calendar integration** was never exercised: no service-account key, ACL, calendar ID, sync token, pagination, quota, 429/5xx, or 410 recovery against Google.
4. **No real messaging provider** was exercised: no WhatsApp/SMS sandbox, credentials, delivery receipts, rate limits, or provider idempotency guarantee.
5. **No staging environment** or staging smoke test exists; staging/production resource isolation is documented but unverified.
6. **No remote D1 or Queues** were provisioned, migrated, or inspected.
7. **D1 Time Travel restore and Worker rollback** were not tested.
8. **CI was not executed** in this review; the workflow exists but its clean-checkout status is unverified.
9. **Alert paging is not configured**; log-derived alerts have no guaranteed delivery or on-call routing.
10. **FreshFold UI and the Dashboard are a Stage A mock-backed scaffold only**; Orders, Deliveries, Customers, production API integration, and browser responsive/visual-regression coverage remain outstanding.
11. **No browser E2E or real IndexedDB** verification was performed.
12. **No load/quota validation** for one-minute Calendar polling, D1 limits, Queue throughput, or provider limits.
13. **Open decisions OPEN-001..OPEN-010** still require explicit confirmation/deferment.
14. **No external security audit**, dependency vulnerability review, Cloudflare account/IAM review, or Google Workspace ACL review.
15. **Architecture/ADR documentation drift**: documents still say "Proposed Phase 1", and some binding/cron tables do not match current Wrangler configuration.

---

## 12. Approval record

| Field | Value |
|---|---|
| T-120 review completed | Yes, as a documentation review with local automated evidence |
| Production readiness claimed | **No** |
| Deployment approved | **No** |
| Reviewer | Automated agent review; human approval still required |
| Approval date | — |
| Approved by | — |
| Conditions | Resolve all Section 11 blockers, record G1–G7 approvals, and run a staging smoke test with real (staging-only) providers |

---

## 13. Recommended next steps

1. Record explicit business decisions for OPEN-001..OPEN-010 and update the constitution/plan/tasks approval status through the proper process.
2. Create isolated staging resources and apply reviewed migrations there first.
3. Run staging smoke tests for Google Calendar and messaging providers using staging-only credentials.
4. Execute Worker rollback and D1 Time Travel restore drills.
5. Wire alerts to an approved on-call/paging destination and calibrate thresholds.
6. Complete the remaining FreshFold screens and production API integration, then add browser responsive and visual-regression tests.
7. Run the CI workflow on a clean checkout and require it before deployment.
8. Record explicit production deployment approval separately; this review does not grant it.
