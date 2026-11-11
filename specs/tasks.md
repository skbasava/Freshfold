# Laundry ERP Task Plan

**Status:** Phase 1 approved on 2026-11-11. Stage A frontend scope approved and implemented on 2026-11-11. Existing task statuses are preserved; production deployment remains separately gated.
**Rule:** Every task must have explicit acceptance criteria, automated tests, security considerations, and completion evidence. Tests must be executed before a task is marked complete.

Task status values: `pending`, `in_progress`, `blocked`, `done`.

---

## Phase 1 review gates

| Gate | Condition |
|---|---|
| G1 | Constitution, plan, and tasks reviewed. |
| G2 | Open decisions in `specs/plan.md` answered or explicitly deferred. |
| G3 | D1 transaction strategy approved for spike. |
| G4 | D1 schema proposal approved for migration authoring. |
| G5 | Authoritative write path approved for implementation. |
| G6 | Phase 2 implementation approved. |
| G7 | Production deploy approved separately. |

---

## Task summary

| ID | Task | Depends on | Phase |
|---|---|---|---|
| T-001 | Phase 0 verification and ADR index | — | 1 |
| T-002 | Architecture diagrams and binding matrix | T-001 | 1 |
| T-010 | Monorepo and toolchain foundation | G6 | 2 |
| T-011 | Worker and frontend scaffolds | T-010 | 2 |
| T-012 | Local environment and secrets example | T-010 | 2 |
| T-013 | Auth foundation | T-011 | 2 |
| T-014 | Testing foundation and CI | T-010 | 2 |
| T-020 | D1 transaction spike | G3, T-010 | 3 |
| T-021 | D1 migrations for core schema | G4, T-020 | 3 |
| T-022 | Customer and order read APIs | T-021 | 3 |
| T-030 | `applyChange()` contract and state machine | T-021 | 3 |
| T-031 | Idempotency and payload hash | T-030 | 3 |
| T-032 | Capacity and slot validation | T-030 | 3 |
| T-040 | Audit and change feed | T-030 | 3 |
| T-050 | Outbox insertion and sweeper | T-030 | 5 |
| T-051 | Queue producers and consumers | T-050 | 5 |
| T-052 | DLQ handling and replay | T-051 | 5 |
| T-060 | Gateway request pipeline | T-013 | 2 |
| T-061 | RBAC and tenant/hub isolation | T-060 | 2 |
| T-062 | Rate limiting and CSRF | T-060 | 2 |
| T-070 | IndexedDB stores and mutation queue | T-030, T-060 | 4 |
| T-071 | Offline create and update workflow | T-070 | 4 |
| T-072 | Change-feed sync and conflict UI | T-070 | 4 |
| T-073 | Multi-tab and recovery | T-072 | 4 |
| T-080 | Google service-account client | T-011 | 6 |
| T-081 | Calendar outbox consumer | T-050, T-080 | 6 |
| T-082 | Calendar poller and echo suppression | T-081 | 6 |
| T-083 | Forbidden-edit revert path | T-082 | 6 |
| T-084 | Nightly reconciliation | T-083 | 6 |
| T-090 | Notification consumer and suppression | T-050 | 7 |
| T-091 | Provider adapters | T-090 | 7 |
| T-100 | Observability and alerts | T-050, T-082, T-090 | 8 |
| T-101 | Runbooks | T-100 | 8 |
| T-110 | Integration and E2E suites | T-060–T-090 | 8 |
| T-120 | Production readiness review | T-110 | 8 |
| T-130 | Phase 1 and Stage A approval record | — | Stage A |
| T-131 | FreshFold UI workspace package | T-130 | Stage A |
| T-132 | Web scaffold and Dashboard | T-131 | Stage A |
| T-133 | Stage A verification | T-132 | Stage A |

---

## T-001: Phase 0 verification and ADR index

**Phase:** 1
**Status:** done
**Description:** Record verified Cloudflare and Google assumptions, official URLs, dates, and unverified items. Create the ADR index and the initial ADR files for deviations.

**Dependencies:** None.

**Files expected to change:**
- `docs/adr/README.md`
- `docs/adr/ADR-001-master-prompt-precedence.md`
- `docs/adr/ADR-002-no-workers-kv.md`
- `docs/adr/ADR-003-fail-closed-guarded-batch.md`
- `docs/adr/ADR-004-calendar-ownership.md`
- `docs/adr/ADR-005-polling-vs-webhooks.md`
- `docs/adr/ADR-006-auth-worker.md`
- `docs/adr/ADR-007-queue-topology.md`
- `docs/adr/ADR-008-timezone.md`
- `docs/adr/ADR-009-no-workflows.md`
- `docs/adr/ADR-010-offline-requirement.md`
- `docs/adr/ADR-011-capacity-model.md`
- `docs/adr/ADR-012-notification-provider.md`

**Acceptance criteria:**
- Every significant Phase 0 claim has an official URL and a verified/unverified status.
- The service-account Calendar ownership deviation is recorded.
- Unverified D1 trigger and `RETURNING` behaviour is flagged as blocked for dependent work.
- No secrets or credentials are present.

**Automated tests:** None. Documentation review only.

**Security considerations:** Do not paste keys, tokens, or customer data into ADRs.

**Completion evidence:** Review link or checklist showing all ADRs created and URLs verified.

---

## T-002: Architecture diagrams and binding matrix

**Phase:** 1
**Status:** done
**Description:** Create the Worker topology diagram, bindings matrix, queue topology, and cron schedule as versioned documentation.

**Dependencies:** T-001.

**Files expected to change:**
- `docs/architecture/topology.md`
- `docs/architecture/bindings.md`
- `docs/architecture/queues.md`
- `docs/architecture/cron.md`

**Acceptance criteria:**
- Only the Laundry Worker has the laundry D1 binding.
- Gateway and Auth have no laundry D1 binding.
- Service-binding directions and deploy order are documented.
- Queue and DLQ names match the plan.
- Cron expressions and UTC/Asia/Kolkata handling are documented.

**Automated tests:** A repository configuration test that parses Wrangler files once they exist and asserts the binding matrix.

**Security considerations:** Document trust boundaries and forbidden bindings.

**Completion evidence:** Diagram review and binding matrix checklist.

---

## T-010: Monorepo and toolchain foundation

**Phase:** 2 — requires G6
**Status:** done
**Description:** Create the pnpm workspace, TypeScript configuration, lint/format configuration, Wrangler workspace, Vitest configuration, and root scripts.

**Dependencies:** G6.

**Files expected to change:**
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `vitest.config.ts`
- `.gitignore`
- `.editorconfig`
- `README.md`

**Acceptance criteria:**
- `pnpm install` succeeds.
- `pnpm typecheck` succeeds.
- `pnpm test` runs an empty or smoke suite successfully.
- No application logic is added.
- Versions match the approved Phase 0 list or are re-verified and documented.

**Automated tests:** Typecheck and smoke test.

**Security considerations:** Review lockfile; no secrets; no postinstall scripts without review.

**Completion evidence:** `pnpm install`, `pnpm typecheck`, and `pnpm test` passed locally on 2026-11-11 (12 tests).

---

## T-011: Worker and frontend scaffolds

**Phase:** 2 — requires G6
**Status:** done
**Description:** Scaffold `apps/web` and the Gateway, Auth, Laundry, Calendar, Notification, and Scheduler Workers with Wrangler configuration placeholders and health endpoints.

**Dependencies:** T-010.

**Files expected to change:**
- `apps/web/`
- `workers/gateway/`
- `workers/auth/`
- `workers/laundry/`
- `workers/calendar/`
- `workers/notifications/`
- `workers/scheduler/`
- `packages/contracts/`
- `packages/domain/`
- `packages/shared/`

**Acceptance criteria:**
- Each Worker starts locally.
- Health endpoints return a typed response.
- Wrangler configs declare only the bindings in the plan.
- No D1 schema or order logic is implemented.

**Automated tests:** Worker smoke tests via Vitest Workers integration.

**Security considerations:** No public internal Worker routes; service bindings only.

**Completion evidence:** All six Workers reached `Ready` under `wrangler dev`; Vitest health suite passed (6 tests).

---

## T-012: Local environment and secrets example

**Phase:** 2 — requires G6
**Status:** done
**Description:** Document local setup, create `.dev.vars.example` with placeholders, and document staging/production secret separation.

**Dependencies:** T-010.

**Files expected to change:**
- `.dev.vars.example`
- `docs/runbooks/local-development.md`
- `docs/runbooks/environment-separation.md`

**Acceptance criteria:**
- `.dev.vars.example` contains placeholders only.
- No real credentials are committed.
- Local, staging, and production resources are clearly separated.
- Secret rotation steps are documented.

**Automated tests:** Secret scanning check.

**Security considerations:** No real keys; document least privilege.

**Completion evidence:** `.dev.vars.example` contains placeholders only; local-development and environment-separation runbooks added.

---

## T-013: Auth foundation

**Phase:** 2 — requires G6
**Status:** done
**Description:** Implement Auth Worker login/logout, session storage, password hashing, role and hub membership, and revocation. Implement Gateway session verification via service binding.

**Dependencies:** T-011.

**Files expected to change:**
- `workers/auth/src/`
- `workers/auth/wrangler.jsonc`
- `migrations/auth/`
- `workers/gateway/src/auth/`
- `packages/contracts/src/auth.ts`

**Acceptance criteria:**
- Passwords are hashed with PBKDF2-HMAC-SHA256 and per-user salt.
- Session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`.
- Logout revokes the session.
- Gateway rejects missing/invalid sessions.
- Client-supplied role and hub are ignored.

**Automated tests:** Auth unit tests and Gateway integration tests for valid, invalid, expired, and revoked sessions.

**Security considerations:** Rate limiting, CSRF, secure cookie flags, no secrets in logs.

**Completion evidence:** Auth unit and D1 integration tests passed locally on 2026-11-11 (password hashing, token hashing, login, session, expiry, revocation, role change, hub rejection). Gateway integration tests passed for valid, missing, invalid, expired, and revoked sessions plus ignored client role/hub headers. Cookie flags and CSRF logout verified. Security checklist recorded in `docs/runbooks/auth.md`. Login rate limiting remains assigned to T-062.

---

## T-014: Testing foundation and CI

**Phase:** 2 — requires G6
**Status:** done
**Description:** Configure Vitest Workers integration, deterministic clock helpers, fake Google and messaging providers, and CI for typecheck, tests, and secret scanning.

**Dependencies:** T-010.

**Files expected to change:**
- `tests/setup/`
- `tests/fakes/google-calendar.ts`
- `tests/fakes/notification-provider.ts`
- `tests/helpers/clock.ts`
- `.github/workflows/ci.yml` or equivalent CI config

**Acceptance criteria:**
- CI runs typecheck, unit tests, and secret scanning.
- Fakes are deterministic and reusable.
- No real external calls in CI.

**Automated tests:** CI pipeline itself.

**Security considerations:** No staging credentials in CI; secret scanning enabled.

**Completion evidence:** Vitest Workers integration, deterministic clock helper, fake Calendar/notification providers, and CI workflow with gitleaks and dry-runs added; `pnpm test` passed locally (12 tests).

---

## T-020: D1 transaction spike

**Phase:** 3 — requires G3
**Status:** done
**Description:** Prove the fail-closed guarded-batch strategy in the Workers Vitest D1 environment before authoring production migrations.

**Dependencies:** G3, T-010.

**Files expected to change:**
- `tests/integration/d1/batch-atomicity.test.ts`
- `tests/integration/d1/concurrent-slot.test.ts`
- `tests/integration/d1/replay.test.ts`
- `tests/integration/d1/triggers-returning.test.ts`
- `docs/adr/ADR-003-fail-closed-guarded-batch.md`

**Acceptance criteria:**
- Zero-row canonical update leaves zero audit, change, outbox, and capacity rows.
- Two concurrent final-slot requests: exactly one succeeds; count never exceeds capacity.
- Replay with the same mutation ID writes nothing and returns the stored result.
- Same mutation ID with a different payload is rejected.
- Trigger and `RETURNING` behaviour is documented as verified or rejected.

**Automated tests:** The tests listed above, executed with the Workers Vitest D1 integration.

**Security considerations:** Bound parameters only; no test secrets.

**Completion evidence:** `tests/integration/d1/` passed in the Workers Vitest D1 environment: zero-row update wrote no dependent rows; 5 concurrent final-slot iterations produced exactly one success; replay and payload-mismatch cases wrote nothing; `INSERT OR IGNORE` replay was idempotent; triggers, `RAISE(ABORT)` rollback, and `UPDATE ... RETURNING` were verified and documented in ADR-003. No production write path was added.

---

## T-021: D1 migrations for core schema

**Phase:** 3 — requires G4
**Status:** done
**Description:** Author versioned D1 migrations for tenants, hubs, customers, delivery slots, orders, order items, order events, changes, outbox, calendar sync, sync state, notifications, and calendar repairs.

**Dependencies:** G4, T-020.

**Files expected to change:**
- `migrations/laundry/0001_core.sql`
- `migrations/laundry/0002_indexes.sql`
- `migrations/laundry/README.md`

**Acceptance criteria:**
- Migrations apply cleanly from an empty database.
- Foreign keys, uniqueness, and checks match the approved schema.
- All business tables include hub scope.
- JSON columns have `json_valid` checks.
- No final migration is declared production-ready without review.

**Automated tests:** Migration apply/rollback tests in a local D1 database.

**Security considerations:** No destructive migration without a backup plan; no secrets.

**Completion evidence:** `migrations/laundry/0001_core.sql` and `0002_indexes.sql` applied cleanly to an empty local D1 database (14 + 18 commands); `tests/integration/d1/migrations.test.ts` passed (4 tests) for tables, indexes, hub-scoped order items, foreign keys, unique changes, and JSON checks. Migrations are local/staging candidates only; no remote apply or production-final declaration was made.

---

## T-022: Customer and order read APIs

**Phase:** 3 — requires G4
**Status:** done
**Description:** Implement hub-scoped customer and order read endpoints through Gateway and Laundry.

**Dependencies:** T-021.

**Files expected to change:**
- `workers/laundry/src/customers/`
- `workers/laundry/src/orders/read.ts`
- `workers/gateway/src/routes/orders.ts`
- `packages/contracts/src/orders.ts`

**Acceptance criteria:**
- Reads are hub-scoped from trusted context.
- Pagination is deterministic.
- Unknown or cross-hub IDs return not found.
- Responses use shared contracts.

**Automated tests:** API integration tests including cross-hub denial.

**Security considerations:** No IDOR; no client-supplied hub trust.

**Completion evidence:** `tests/unit/order-contracts.test.ts` (4), `tests/integration/reads.test.ts` (10), `tests/integration/gateway-reads.test.ts` (5), and full `pnpm check` (23 files, 94 tests) pass. Reads use the signed hub only, deterministic `created_at DESC, id DESC` cursors, shared Zod contracts, and return 404 for unknown/cross-hub IDs. Local only; no remote validation.

---

## T-030: `applyChange()` contract and state machine

**Phase:** 3 — requires G5
**Status:** done
**Description:** Implement the typed `applyChange()` input, intent validation, state machine, and guarded batch for create, reschedule, mark processing, place/release hold, mark out for delivery, mark delivered, and cancel.

**Dependencies:** T-021.

**Files expected to change:**
- `workers/laundry/src/orders/apply-change.ts`
- `workers/laundry/src/domain/state-machine.ts`
- `workers/laundry/src/domain/intents.ts`
- `packages/contracts/src/mutations.ts`
- `tests/unit/state-machine.test.ts`
- `tests/integration/apply-change.test.ts`

**Acceptance criteria:**
- All intents are explicit verbs; no arbitrary status patch.
- Stale `baseVersion` returns 409.
- Invalid transition returns 422 without writes.
- Successful mutation commits order, event, change, and outbox atomically.
- No external calls occur inside the batch.

**Automated tests:** Unit state-machine tests and D1 integration tests.

**Security considerations:** Actor and hub come from trusted context; payload is validated.

**Completion evidence:** Approved minimal status model implemented per ADR-013: `confirmed`, `processing`, `hold`, `out_for_delivery`, `delivered`, `cancelled`; hold comments are required, persisted in `orders.hold_comment`, visible in reads, cleared on release/cancel, and recorded in event history. `tests/unit/state-machine.test.ts` (10), `tests/integration/apply-change.test.ts` (14), `tests/integration/apply-change-route.test.ts` (4), and full `pnpm check` (28 files, 129 tests) pass. Successful mutations commit order, items, event, change, and outbox rows atomically; stale versions, invalid transitions, full slots, and cross-hub access are rejected without partial writes. Canonical payload hashing is implemented in T-031. Local only; no remote validation.

---

## T-031: Idempotency and payload hash

**Phase:** 3 — requires G5
**Status:** done
**Description:** Add canonical payload hashing and replay detection.

**Dependencies:** T-030.

**Files expected to change:**
- `workers/laundry/src/orders/idempotency.ts`
- `packages/shared/src/canonical-json.ts`
- `tests/integration/idempotency.test.ts`

**Acceptance criteria:**
- Replay returns the stored result without new rows.
- Same mutation ID with different payload returns 409.
- Hash is stable across key ordering.
- Duplicate create does not duplicate event or outbox.

**Automated tests:** Replay and payload-mismatch integration tests.

**Security considerations:** Do not log payloads containing PII.

**Completion evidence:** `tests/unit/canonical-json.test.ts` (3), `tests/integration/idempotency.test.ts` (3), and full `pnpm check` (28 files, 120 tests) pass. Canonical JSON sorts object keys recursively, preserves array order, and rejects non-JSON values. Replays write no rows; reordered keys replay; changed payloads return `409 MUTATION_PAYLOAD_MISMATCH`; duplicate creates keep one event/change and two outbox rows. Local only; no remote validation.

---

## T-032: Capacity and slot validation

**Phase:** 3 — requires G4
**Status:** done
**Description:** Implement slot validation, business hours, and transactional capacity checks for create, reschedule, and cancel.

**Dependencies:** T-030, OPEN-003.

**Files expected to change:**
- `workers/laundry/src/capacity/`
- `workers/laundry/src/domain/business-time.ts`
- `tests/unit/business-time.test.ts`
- `tests/integration/capacity.test.ts`

**Acceptance criteria:**
- Capacity is checked inside the guarded statement.
- Reschedule releases and acquires atomically.
- Cancellation releases capacity.
- No oversubscription under concurrency.
- Business hours use Asia/Kolkata.

**Automated tests:** Concurrent final-slot tests and timezone boundary tests.

**Security considerations:** No client-side capacity authority.

**Completion evidence:** `tests/unit/business-time.test.ts` (5) and `tests/integration/capacity.test.ts` (4) cover IST boundaries, outside-hours rejection, concurrent final-slot claims, and failed-reschedule release semantics. Full `pnpm check` passes with 30 files and 138 tests. Capacity remains in the guarded SQL; business hours are 09:00–20:00 Asia/Kolkata; no client-side capacity authority.

---

## T-040: Audit and change feed

**Phase:** 3 — requires G5
**Status:** done
**Description:** Implement order event audit and the change-feed endpoint.

**Dependencies:** T-030.

**Files expected to change:**
- `workers/laundry/src/orders/events.ts`
- `workers/laundry/src/sync/changes.ts`
- `workers/gateway/src/routes/changes.ts`
- `tests/integration/change-feed.test.ts`

**Acceptance criteria:**
- Every accepted mutation has exactly one event and one change row.
- Feed is ordered by sequence.
- Tombstones are returned for deletions.
- Cursor pagination is stable.
- Cross-hub rows are never returned.

**Automated tests:** Ordering, pagination, tombstone, and isolation tests.

**Security considerations:** Feed scoped by trusted hub.

**Completion evidence:** `tests/unit/change-contracts.test.ts` (4), `tests/integration/change-feed.test.ts` (6), and extended `tests/integration/gateway-reads.test.ts` (6) pass; full `pnpm check` passes with 32 files and 149 tests. Feed is hub-scoped, ascending by `changes.id`, cursor-stable, returns tombstones, and exposes per-order audit events. Local only; no remote validation.

---

## T-050: Outbox insertion and sweeper

**Phase:** 5
**Status:** done
**Description:** Implement outbox rows in `applyChange()` and the Scheduler sweeper with lease claiming and recovery.

**Dependencies:** T-030.

**Files expected to change:**
- `workers/laundry/src/outbox/`
- `workers/scheduler/src/sweeper.ts`
- `tests/integration/outbox-claim.test.ts`

**Acceptance criteria:**
- Commit survives a crash before enqueue.
- Sweeper claims each row once.
- Expired leases are reclaimed.
- Backoff and max attempts are applied.
- Duplicate sweeps do not duplicate work.

**Automated tests:** Crash-after-commit, claim, lease expiry, and duplicate-sweep tests.

**Security considerations:** No secrets in outbox rows.

**Completion evidence:** `tests/integration/outbox-claim.test.ts` (9), `tests/integration/outbox-sweep-route.test.ts` (3), and `tests/unit/scheduler-sweeper.test.ts` (2) pass. Full `pnpm check` passes with 35 files and 163 tests. Verified lease claiming, expired-lease recovery, backoff and max attempts, duplicate-sweep idempotency, and scheduler-triggered sweep locally. No remote validation.

---

## T-051: Queue producers and consumers

**Phase:** 5
**Status:** done
**Description:** Implement `calendar-queue` and `notify-queue` producers and consumer skeletons with explicit ack/retry.

**Dependencies:** T-050.

**Files expected to change:**
- `workers/scheduler/src/queues.ts`
- `workers/calendar/src/consumer.ts`
- `workers/notifications/src/consumer.ts`
- `packages/contracts/src/queue-messages.ts`

**Acceptance criteria:**
- Every message is explicitly acked or retried.
- Duplicate messages are idempotent.
- Out-of-order messages reload authoritative state.
- Consumer crash does not lose committed work.

**Automated tests:** Duplicate, out-of-order, and crash tests.

**Security considerations:** Validate message shape; do not trust message payload as truth.

**Completion evidence:** `tests/unit/queue-consumers.test.ts` (12) and `tests/unit/scheduler-queues.test.ts` (3) pass, covering duplicate, stale, out-of-order, 404, transient failure, invalid-message, missing-token, batch ack/retry, and queue-routing behavior. Full `pnpm check` passes with 37 files and 178 tests; calendar and notifications `wrangler deploy --dry-run` pass. Local-only validation; no remote deployment.

---

## T-052: DLQ handling and replay

**Phase:** 5
**Status:** done
**Description:** Implement DLQ routing, inspection, alerting, and controlled replay.

**Dependencies:** T-051.

**Files expected to change:**
- `workers/scheduler/src/dlq.ts`
- `docs/runbooks/dlq-replay.md`
- `tests/integration/dlq.test.ts`

**Acceptance criteria:**
- Exhausted messages land in the correct DLQ.
- DLQ depth is observable.
- Replay is idempotent.
- Poison messages are isolated.

**Automated tests:** Retry exhaustion and safe replay tests.

**Security considerations:** Admin replay is authorized and audited.

**Completion evidence:** `tests/integration/dlq.test.ts` passed with 12 tests covering Scheduler DLQ batch ack/no-retry for valid and poison messages on both `laundry-calendar-dlq` and `laundry-notify-dlq`, Laundry failed-row listing and ordering, replay reset to `pending` with attempts/lease/error cleared, idempotent second replay, 403 for user actors, invalid input rejection, service-binding headers/URLs, non-OK errors, missing `SERVICE_TOKEN`, admin timing-safe token rejection, and structured `outbox_replayed`/`dlq_replay` audit logs. Full `pnpm check` passes with 38 files and 190 tests; all six Workers pass `wrangler deploy --dry-run`; secret regex scan found only placeholders and test literals. Local-only validation; no remote or staging verification. See `docs/runbooks/dlq-replay.md`.

---

## T-060: Gateway request pipeline

**Phase:** 2 — requires G6
**Status:** done
**Description:** Implement request validation, correlation IDs, trusted context forwarding, and secure error handling.

**Dependencies:** T-013.

**Files expected to change:**
- `workers/gateway/src/middleware/`
- `workers/gateway/src/routes/`
- `packages/contracts/src/http.ts`

**Acceptance criteria:**
- Every business request has a correlation ID.
- Invalid payloads return 400 without stack traces.
- Trusted context is signed and forwarded.
- Client identity headers are ignored.

**Automated tests:** Gateway integration tests.

**Security considerations:** No secret leakage; strict validation.

**Completion evidence:** Gateway integration tests passed locally on 2026-11-11 for correlation IDs, validation errors without stacks, signed context forwarding, and client identity header stripping. `tests/integration/gateway-pipeline.test.ts`.

---

## T-061: RBAC and tenant/hub isolation

**Phase:** 2 — requires G6
**Status:** done
**Description:** Implement role checks and hub-scoped authorization for all business operations.

**Dependencies:** T-060.

**Files expected to change:**
- `workers/laundry/src/authz/`
- `workers/gateway/src/middleware/rbac.ts`
- `tests/integration/tenant-isolation.test.ts`

**Acceptance criteria:**
- Front desk and manager permissions match the matrix.
- Cross-hub access is denied.
- Service calls use service identity.
- Calendar edits are system-attributed.

**Automated tests:** Authorization matrix and cross-tenant tests.

**Security considerations:** Default deny.

**Completion evidence:** Permission matrix, signed-context verification, service identity, cross-hub denial, and gateway RBAC tests passed locally on 2026-11-11. `tests/unit/permissions.test.ts`, `tests/unit/internal-context.test.ts`, `tests/integration/tenant-isolation.test.ts`, `tests/integration/gateway-rbac.test.ts`.

---

## T-062: Rate limiting and CSRF

**Phase:** 2 — requires G6
**Status:** done
**Description:** Implement login and mutation rate limiting and CSRF protection.

**Dependencies:** T-060.

**Files expected to change:**
- `workers/gateway/src/middleware/rate-limit.ts`
- `workers/gateway/src/middleware/csrf.ts`
- `tests/integration/csrf.test.ts`

**Acceptance criteria:**
- State-changing requests require a valid CSRF token.
- Excessive requests are rejected with 429.
- Cookies are secure.

**Automated tests:** CSRF and rate-limit tests.

**Security considerations:** Do not weaken CSRF for API clients.

**Completion evidence:** CSRF and rate-limit integration tests passed locally on 2026-11-11, including missing/mismatched CSRF rejection, safe-method exemption, login IP/account limits, mutation limits, secure cookie flags, and fail-closed production behavior. `tests/integration/csrf.test.ts`, `tests/integration/rate-limit.test.ts`. Bindings and behavior documented in `docs/runbooks/gateway.md`.

---

## T-070: IndexedDB stores and mutation queue

**Phase:** 4
**Status:** done
**Description:** Implement the IndexedDB schema, optimistic write transaction, and mutation queue.

**Dependencies:** T-030, T-060, OPEN-001.

**Files expected to change:**
- `apps/web/src/db/`
- `apps/web/src/sync/mutation-queue.ts`
- `apps/web/src/sync/types.ts`
- `tests/unit/indexeddb.test.ts`

**Acceptance criteria:**
- Optimistic order and mutation are written in one transaction.
- Mutation IDs are stable across retries.
- Pending, rejected, and conflict states are preserved.
- An offline order is never shown as confirmed.

**Automated tests:** IndexedDB unit tests with fake storage.

**Security considerations:** No sensitive data in local storage beyond needed order cache.

**Completion evidence:** Implemented `apps/web/src/sync/types.ts`, `apps/web/src/db/` (backend contract plus IndexedDB implementation), and `apps/web/src/sync/mutation-queue.ts`. Focused run `pnpm vitest run tests/unit/indexeddb.test.ts` passed **10/10 tests**. Full `pnpm check` passed: typecheck for root, `apps/web`, and all workers; Vitest **39 files / 200 tests**. Verified optimistic order+mutation write in one readwrite transaction, transaction-abort rollback, UUID mutation identity stable across attempts, preserved rejected/conflict mutations, synced transition with order version update, and order filtering. This is local TypeScript/unit verification only: the in-memory fake `StorageBackend` was exercised, not a real browser IndexedDB instance; no browser E2E was run.

---

## T-071: Offline create and update workflow

**Phase:** 4
**Status:** done
**Description:** Implement offline create and update flows with per-order ordered submission.

**Dependencies:** T-070.

**Files expected to change:**
- `apps/web/src/orders/`
- `apps/web/src/sync/submit.ts`
- `tests/e2e/offline-create.test.ts`

**Acceptance criteria:**
- Create works offline.
- Updates are sent in order per order.
- Reconnect flushes the queue.
- 409 and 422 preserve the mutation.

**Automated tests:** Offline create/update and reconnect tests.

**Security considerations:** No false confirmation; secure session handling.

**Completion evidence:** Implemented `apps/web/src/orders/local-order.ts`, `apps/web/src/orders/offline.ts`, and `apps/web/src/sync/submit.ts`, extending the T-070 queue/storage contract for canonical replacement, conflict server snapshots, meta access, and ordered mutation submission. Focused run `pnpm vitest run tests/e2e/offline-create.test.ts` passed **8/8 tests**. Full `pnpm check` passed with **42 test files / 227 tests**. Verified offline creation with one optimistic write transaction, ULID order IDs and stable UUID mutation IDs across retries, per-order creation-order submission, reconnect-triggered flush, 409 `VERSION_CONFLICT` preservation with server order, and 422 rejection preservation without false confirmation. Tests use the in-memory `StorageBackend` and scripted transports; no real browser IndexedDB or browser E2E was run.

---

## T-072: Change-feed sync and conflict UI

**Phase:** 4
**Status:** done
**Description:** Implement cursor-based change-feed pull, local apply, and conflict presentation.

**Dependencies:** T-070.

**Files expected to change:**
- `apps/web/src/sync/change-feed.ts`
- `apps/web/src/orders/conflicts.ts`
- `tests/e2e/change-feed.test.ts`

**Acceptance criteria:**
- Cursor advances only after a page is applied.
- Tombstones remove local rows.
- Pending local mutation plus newer server version shows a conflict.
- Snapshot recovery resets the cursor safely.

**Automated tests:** Feed ordering, conflict, and snapshot tests.

**Security considerations:** Hub isolation in local storage.

**Completion evidence:** Implemented `apps/web/src/sync/change-feed.ts` and `apps/web/src/orders/conflicts.ts` with shared contracts and the T-070 queue/storage. Focused run `pnpm vitest run tests/e2e/change-feed.test.ts` passed **12/12 tests**. Full `pnpm check` passed with **42 test files / 227 tests**. Verified ascending-page application with cursor advancement only after each page commits, tombstones deleting local rows, pending local mutation plus newer server version becoming a preserved conflict with the server order attached, snapshot rebuild with safe cursor reset, and hub rejection without leakage. Conflict presentation is a tested TypeScript view-model/data layer (`describeOrderSync`, `summarizeSyncState`); no React/Vite workspace UI was added because the task's acceptance behavior is covered at the data layer, and no browser E2E was run.

---

## T-073: Multi-tab and recovery

**Phase:** 4
**Status:** done
**Description:** Add Web Locks coordination, BroadcastChannel notifications, storage persistence, and eviction recovery.

**Dependencies:** T-072.

**Files expected to change:**
- `apps/web/src/sync/locks.ts`
- `apps/web/src/sync/broadcast.ts`
- `apps/web/src/sync/recovery.ts`
- `tests/e2e/multi-tab.test.ts`

**Acceptance criteria:**
- Only one tab polls the feed.
- Per-order submissions are serialized.
- Reload preserves pending mutations.
- Cleared storage rebuilds from snapshot and warns about lost mutations.

**Automated tests:** Multi-tab and recovery tests.

**Security considerations:** No cross-hub leakage between sessions.

**Completion evidence:** Implemented `apps/web/src/sync/locks.ts`, `apps/web/src/sync/broadcast.ts`, and `apps/web/src/sync/recovery.ts`. Focused run `pnpm vitest run tests/e2e/multi-tab.test.ts` passed **7/7 tests**. Full `pnpm check` passed with **42 test files / 227 tests**. Verified single feed leader via Web Locks with an in-memory fallback, per-order submission serialization, pending mutation survival across a simulated reload using the same durable backend, hub-scoped BroadcastChannel delivery, storage-persistence requests, before-unload warnings for unsynced mutations, and cleared-storage rebuild from a snapshot with a lost-mutation warning. The lost-mutation count is supplied by the caller because cleared storage cannot self-report it. These are local data-layer tests against fake locks/channels/storage, not real multi-tab browser E2E.

---

## T-080: Google service-account client

**Phase:** 6
**Status:** done
**Description:** Implement RS256 JWT signing with WebCrypto, token exchange, caching, and refresh.

**Dependencies:** T-011.

**Files expected to change:**
- `packages/calendar-client/src/auth.ts`
- `packages/calendar-client/src/client.ts`
- `workers/calendar/wrangler.jsonc`
- `tests/unit/google-auth.test.ts`

**Acceptance criteria:**
- JWT `aud` is the token endpoint.
- `exp` is at most one hour.
- Access tokens are cached until near expiry.
- Private key comes from Secrets only.
- Clock skew is handled.

**Automated tests:** JWT claim and token-refresh unit tests with fake fetch.

**Security considerations:** No key in source or logs; minimal scopes.

**Completion evidence:** Implemented `packages/calendar-client/src/auth.ts` (WebCrypto RS256 assertion, token endpoint exchange, cache/refresh/skew) and `client.ts` (insert/get/list/patch/delete, sync-token pagination, `If-Match`, 409/410/412/429 surfacing). Updated `workers/calendar/wrangler.jsonc` with the poller/reconciliation crons, hub/calendar vars, and runtime-secret notes. Focused run `pnpm vitest run tests/unit/google-auth.test.ts tests/unit/google-calendar-client.test.ts` passed **12/12 tests**. Full `pnpm check` passed **48 test files / 279 tests**. `pnpm exec wrangler deploy --dry-run --config workers/calendar/wrangler.jsonc` succeeded. Secret regex scan found no key/token material, only placeholder names and runbook commands. Verified JWT `aud`, ≤1-hour `exp`, RS256 signature, token caching until the skew window, forced refresh, conditional writes, pagination parameters, and 404/410/412/429 error surfacing. Not verified: real Google token exchange, real Calendar API behaviour, or staging credentials; automated tests use injected `fetch` only.

---

## T-081: Calendar outbox consumer

**Phase:** 6
**Status:** done
**Description:** Consume `calendar-queue`, project canonical orders to deterministic Google events, and persist etag/version.

**Dependencies:** T-050, T-080.

**Files expected to change:**
- `workers/calendar/src/consumer.ts`
- `workers/calendar/src/projection.ts`
- `tests/integration/calendar-consumer.test.ts`

**Acceptance criteria:**
- Stale outbox work is skipped.
- Insert 409 is treated as existing and patched.
- Etag and `synced_version` are stored.
- 429/5xx retries with backoff.
- Duplicate messages produce one event.

**Automated tests:** Fake Google consumer tests.

**Security considerations:** Minimal event payload; no PII.

**Completion evidence:** Implemented `workers/calendar/src/consumer.ts`, `projection.ts`, a hub-scoped Calendar-state client (`laundry.ts`), and Laundry internal routes/store for order+sync reload, projection persistence, sync state, repairs, reschedule, outbox completion, and safe repair enqueue. Focused run `pnpm vitest run tests/integration/calendar-consumer.test.ts` passed **14/14 tests**. Full `pnpm check` passed **48 test files / 279 tests**. Verified deterministic base32hex event IDs, minimal PII-free payloads, stale/duplicate skipping, insert-409 patch, etag/`synced_version` persistence, one event for duplicate messages, 429/5xx and transient Laundry retry, outbox completion, and service-header hub scoping. Not verified: real Google writes, real Queue delivery, or staging.

---

## T-082: Calendar poller and echo suppression

**Phase:** 6
**Status:** done
**Description:** Implement incremental sync, pagination, etag comparison, and own-write suppression.

**Dependencies:** T-081.

**Files expected to change:**
- `workers/calendar/src/poller.ts`
- `workers/calendar/src/classify.ts`
- `workers/calendar/src/sync-state.ts`
- `tests/integration/calendar-poller.test.ts`

**Acceptance criteria:**
- Own writes are not treated as manager edits.
- Pagination processes all pages.
- Next token persists only after the full response.
- 410 triggers full resync.
- Unknown events are not deleted.

**Automated tests:** Echo, pagination, 410, and 429 tests.

**Security considerations:** Do not log event descriptions or customer data.

**Completion evidence:** Implemented `workers/calendar/src/poller.ts`, `classify.ts`, `sync-state.ts`, and the Calendar Worker cron dispatch. Focused run `pnpm vitest run tests/integration/calendar-poller.test.ts` passed **10/10 tests**. Full `pnpm check` passed **48 test files / 279 tests**. Verified stored-etag and semantic echo suppression, valid manager start-time moves through Laundry `applyChange()` with the projected version, processing of every page before token persistence, no token advance when a later page returns 429, HTTP 410 full resync, unknown events left untouched, forbidden-edit reverts, deleted-event restoration, and 429 surfacing. Automated pagination/sync-token behaviour uses the in-memory fake calendar; real Google `syncToken` behaviour and staging are not verified.

---

## T-083: Forbidden-edit revert path

**Phase:** 6
**Status:** done
**Description:** Implement conditional reverts for forbidden fields, resizes, all-day edits, past edits, and rejected reschedules.

**Dependencies:** T-082.

**Files expected to change:**
- `workers/calendar/src/revert.ts`
- `workers/calendar/src/repairs.ts`
- `tests/integration/calendar-revert.test.ts`

**Acceptance criteria:**
- Title, description, color, recurrence, resize, and all-day edits are reverted.
- Deleted events are restored.
- 412 causes re-fetch and re-evaluation.
- Rejected reschedules do not call `applyChange`.
- Repair outcomes are recorded.

**Automated tests:** Forbidden-edit and 412 tests.

**Security considerations:** No manager identity claim without attribution.

**Completion evidence:** Implemented `workers/calendar/src/revert.ts` and `repairs.ts`, including conditional `If-Match` writes, 412 refetch/re-evaluation, deleted-event restoration, canonical re-projection, and `calendar_repairs` recording through Laundry. Focused run `pnpm vitest run tests/integration/calendar-revert.test.ts` passed **10/10 tests**. Full `pnpm check` passed **48 test files / 279 tests**. Verified reverts for title, description, color, recurrence, resize, all-day, and past-time edits; deleted-event restoration; 412 refetch/re-evaluation; rejected reschedule with no order version/event mutation and no second `applyChange`; and persisted repair outcomes. No manager identity is asserted; repairs record the calendar edit reason only. Not verified: real Google conditional writes or staging.

---

## T-084: Nightly reconciliation

**Phase:** 6
**Status:** done
**Description:** Implement reconciliation that ingests manager edits before repairing drift.

**Dependencies:** T-083.

**Files expected to change:**
- `workers/calendar/src/reconciliation.ts`
- `tests/integration/reconciliation.test.ts`

**Acceptance criteria:**
- Outstanding manager edits are ingested first.
- Missing events are repaired.
- Unprocessed manager edits are not overwritten.
- Unresolved conflicts are recorded and alerted.
- No bulk overwrite.

**Automated tests:** Reconciliation drift and pending-edit tests.

**Security considerations:** Read-only where possible; authorized writes only.

**Completion evidence:** Implemented `workers/calendar/src/reconciliation.ts` and wired the nightly cron before the minute poller. Focused run `pnpm vitest run tests/integration/reconciliation.test.ts` passed **6/6 tests**. Full `pnpm check` passed **48 test files / 279 tests**. Verified outstanding manager edits are ingested by the poller before comparison, missing events are enqueued as safe `REPAIR_EVENT` work and then materialized by the consumer, pending projections are not overwritten, unresolved etag/revision conflicts are recorded and alerted with metrics, unknown events are never deleted, and reconciliation performs no direct/bulk event overwrite. The unresolved-conflict test injects a no-op poll to simulate an edit that could not be ingested; real Google/staging and production alert delivery are not verified.

---

## T-090: Notification consumer and suppression

**Phase:** 7
**Status:** done
**Description:** Implement delayed notification consumption, order re-check, claim, and suppression.

**Dependencies:** T-050, OPEN-007.

**Files expected to change:**
- `workers/notifications/src/consumer.ts`
- `workers/notifications/src/eligibility.ts`
- `tests/integration/notification-suppression.test.ts`

**Acceptance criteria:**
- Delayed messages re-read the order.
- Superseded changes are suppressed.
- Duplicate delivery updates are suppressed.
- Claims prevent duplicate sends.
- Provider timeout is recorded without false exactly-once claims.

**Automated tests:** Suppression, duplicate, and timeout tests.

**Security considerations:** No phone numbers or message contents in logs.

**Completion evidence:** Implemented `workers/notifications/src/eligibility.ts` and the notification flow in `workers/notifications/src/consumer.ts`, plus `workers/notifications/src/laundry.ts`, `workers/laundry/src/notifications/store.ts`, internal Laundry claim/suppress/outcome/reload routes, and notification contracts. Focused run `pnpm vitest run tests/integration/notification-suppression.test.ts` passed **14/14 tests**, covering authoritative reload, superseded and duplicate-delivery suppression, duplicate/concurrent claim protection, delayed `retry({ delaySeconds })`, canonical-behind retry, missing order, rate-limit/transient retry, terminal failure, uncertain timeout without exactly-once claims, the crash window between provider acceptance and outcome recording, and PII-free logs. Full `pnpm check` passed **50 test files / 299 tests**. `pnpm exec wrangler deploy --dry-run --config workers/notifications/wrangler.jsonc` succeeded and showed only non-secret notification vars. Secret regex scan found only a test-literal `Bearer ...` value. `NOTIFICATION_DELAY_SECONDS` defaults to 0 until OPEN-007 business confirmation; no real provider, WhatsApp/SMS credentials, remote resource, or staging environment was used or verified.

---

## T-091: Provider adapters

**Phase:** 7
**Status:** done
**Description:** Implement WhatsApp/SMS provider adapters with retry classification and idempotency keys.

**Dependencies:** T-090.

**Files expected to change:**
- `packages/notification-client/src/`
- `workers/notifications/wrangler.jsonc`
- `tests/unit/notification-client.test.ts`

**Acceptance criteria:**
- Provider errors are classified as transient or terminal.
- Idempotency keys are sent when supported.
- Provider message IDs are stored.
- Secrets come from Cloudflare Secrets.

**Automated tests:** Fake provider retry and classification tests.

**Security considerations:** Least-privilege provider credentials.

**Completion evidence:** Implemented `packages/notification-client/src/` with a common `NotificationProviderAdapter`, injectable `fetch`, `ProviderSendError` classification (`transient`, `rate_limited`, `terminal`, `timeout`), WhatsApp and SMS adapters, and a channel factory. SMS sends `Idempotency-Key`; WhatsApp declares no verified idempotency and does not pretend otherwise. Notification Worker configuration now selects `NOTIFICATION_CHANNEL`, delay, and provider credentials from vars/Cloudflare Secrets; `.dev.vars.example` contains placeholders only. Focused run `pnpm vitest run tests/unit/notification-client.test.ts` passed **6/6 tests** covering success, timeout, 429 with `Retry-After`, 5xx transient, 4xx terminal, idempotency-header emission, secret-free errors, and channel selection. Full `pnpm check` passed **50 test files / 299 tests**; notifications Worker `wrangler deploy --dry-run` succeeded. Not verified: any real WhatsApp/SMS network call, provider sandbox/staging credentials, real delivery receipts, or provider idempotency guarantees.

---

## T-100: Observability and alerts

**Phase:** 8
**Status:** done
**Description:** Implement structured logs, metrics, and alert thresholds for all required signals.

**Dependencies:** T-050, T-082, T-090.

**Files expected to change:**
- `packages/shared/src/observability.ts`
- `docs/runbooks/observability.md`
- `workers/scheduler/src/health.ts`

**Acceptance criteria:**
- All required metrics are emitted.
- Correlation IDs are present.
- PII and secrets are redacted.
- Alerts cover outbox age, DLQ depth, sync resets, reverts, reconciliation drift, and notification failures.

**Automated tests:** Redaction and metric emission tests.

**Security considerations:** No sensitive data in logs.

**Completion evidence:** Implemented `packages/shared/src/observability.ts` with `createLogger`, `redactValue`, `safeError`, stable `OBSERVABILITY_EVENTS`/`METRICS`, severity, ISO timestamps, request ID forwarding, correlation IDs (falling back to request IDs), recursive key/value redaction (secrets, phone numbers, message/body contents, email, bearer/JWT/Google tokens, private keys), and circular-value handling. Exported it from `@laundry/shared`. Added `workers/laundry/src/outbox/health.ts`, the Laundry `GET /internal/outbox/health` route, and `workers/scheduler/src/health.ts`; the Scheduler cron now emits `outbox_pending_count`, `outbox_dispatching_count`, `outbox_failed_count`, and `outbox_oldest_pending_age_seconds`, plus `outbox_alert` events for pending age (>300s warning, >900s error) and failed rows (>=1). Instrumented existing operational points: calendar/notification queue retries (`queue_retry_count`), Scheduler DLQ messages (`dlq_message`/`dlq_message_count`), calendar sync-token resets (`calendar_sync_token_reset_count`), calendar reverts (`calendar_revert`/`calendar_revert_count`), reconciliation drift (existing `calendar_reconciliation_drift` plus warning), notification failures (`notification_failure_count`), mutation conflicts and capacity rejections in Laundry, Gateway/Auth safe error logging, and browser-local offline pending mutations (`offline_pending_mutations`/`offline_pending_mutation_count`). Added `docs/runbooks/observability.md` with the signal table, thresholds, inspection commands, redaction rules, and the explicit caveat that alerts are log/observability-based and **not wired to an external paging or metrics provider**. Focused run `pnpm vitest run tests/unit/observability.test.ts tests/unit/scheduler-health.test.ts tests/integration/outbox-health.test.ts` passed **16/16 tests**. Full `pnpm check` passed **53 test files / 315 tests**. All six `pnpm exec wrangler deploy --dry-run` commands succeeded (auth, gateway, laundry, calendar, notifications, scheduler) with only non-secret vars. Secret regex scan found only intentional test literals (`Bearer ...`, a fake Google API key value, a fake Google OAuth token value, and a placeholder private-key block); no real secrets were found. Offline pending counts are browser-console-only until a client telemetry endpoint is approved; no external paging, staging, or production behavior was verified.

---

## T-101: Runbooks

**Phase:** 8
**Status:** done
**Description:** Write operational runbooks for required failure scenarios.

**Dependencies:** T-100.

**Files expected to change:**
- `docs/runbooks/google-outage.md`
- `docs/runbooks/messaging-outage.md`
- `docs/runbooks/d1-errors.md`
- `docs/runbooks/queue-backlog.md`
- `docs/runbooks/invalid-sync-token.md`
- `docs/runbooks/dlq-replay.md`
- `docs/runbooks/incorrect-projection.md`
- `docs/runbooks/notification-uncertainty.md`
- `docs/runbooks/secret-rotation.md`
- `docs/runbooks/staging-to-production.md`

**Acceptance criteria:**
- Each runbook has detection, diagnosis, mitigation, and rollback steps.
- Runbooks reference actual commands and dashboards.
- No secrets are included.

**Automated tests:** Documentation review.

**Security considerations:** Redact credentials and customer data.

**Completion evidence:** Added the required runbooks: `google-outage.md`, `messaging-outage.md`, `d1-errors.md`, `queue-backlog.md`, `invalid-sync-token.md`, `incorrect-projection.md`, `secret-rotation.md`, and `staging-to-production.md`; completed the existing `dlq-replay.md` and `notification-uncertainty.md` with observability links and current thresholds. Each runbook includes detection, diagnosis, mitigation, rollback, and escalation sections, uses placeholder-safe Wrangler/curl commands, references the Cloudflare dashboard and `wrangler tail`, and explicitly warns against logging or pasting secrets, phone numbers, or message contents. Added `docs/runbooks/README.md` as the runbook index and linked it from `README.md`. Review checklist applied: all required scenarios present; each has detect/diagnose/mitigate/rollback; commands use placeholders; no real secrets or customer data; observability caveat states alerts are not connected to external paging. Documentation review was manual only; no staging or production incident/runbook execution was performed.

---

## T-110: Integration and E2E suites

**Phase:** 8
**Status:** done
**Description:** Implement the required integration and ten end-to-end scenarios.

**Dependencies:** T-060 through T-090.

**Files expected to change:**
- `tests/e2e/`
- `tests/integration/`
- `tests/helpers/`

**Acceptance criteria:**
- Offline create, reconnect, and canonical state.
- Creation produces exactly one Calendar event.
- Manager move produces a D1 reschedule.
- Forbidden edit is reverted.
- Failed enqueue is recovered by the sweeper.
- Duplicate queue message produces one event.
- Delayed notification is suppressed after drag-back.
- Provider timeout does not claim exactly-once.
- Full slot rejects a competitor.
- Nightly reconciliation repairs without overwriting a pending manager edit.

**Automated tests:** The E2E suite, with deterministic clocks and fake providers.

**Security considerations:** Staging credentials only for real integration tests.

**Completion evidence:** Added `tests/e2e/production-scenarios.test.ts` (10 tests) and shared helpers in `tests/helpers/e2e.ts`, plus a richer `FakeNotificationProvider` implementing the adapter contract. The suite covers all ten required scenarios end-to-end with deterministic domain clocks and fake Google/messaging providers: (1) offline create through the real reconnect/HTTP mutation route into canonical D1, (2) creation through outbox dispatch to exactly one fake Calendar event, (3) manager move to a D1 reschedule, (4) forbidden Calendar edit reverted, (5) failed queue enqueue recovered by the real Scheduler `sweepOutbox` path, (6) duplicate queue message producing one event, (7) delayed notification suppressed after a Calendar drag-back, (8) provider timeout recorded as `provider_timeout_uncertain` without an exactly-once claim, (9) full slot rejecting a competitor, and (10) nightly reconciliation repairing a missing event without overwriting a pending manager change. Focused run `pnpm vitest run tests/e2e/production-scenarios.test.ts` passed **10/10 tests**. Full `pnpm check` passed **54 test files / 325 tests**. All six `pnpm exec wrangler deploy --dry-run` commands succeeded. Secret regex scan found only three intentional test fixtures (fake Bearer value, fake PEM key, fake JWT) and no real credential. Not verified: real Google Calendar, real WhatsApp/SMS provider, staging credentials, remote D1/Queues, browser IndexedDB, or production deployment.

---

## T-120: Production readiness review

**Phase:** 8
**Status:** done — review complete, deployment not approved
**Description:** Review security, migrations, rollback, observability, runbooks, quotas, and environment separation before production.

**Dependencies:** T-110.

**Files expected to change:**
- `docs/runbooks/production-readiness.md`

**Acceptance criteria:**
- All gates G1–G7 are satisfied.
- Rollback and restore are tested.
- Staging and production are isolated.
- No open critical security issue.
- Explicit production approval is recorded.

**Automated tests:** Full suite plus staging smoke test.

**Security considerations:** Final secret and PII review.

**Completion evidence:** Added `docs/runbooks/production-readiness.md` and linked it from the runbook index and top-level README. The review covers architecture invariants, security controls, migrations/rollback, secrets and environment separation, observability/alerting, runbooks, testing evidence, OPEN-001..OPEN-010, and deployment gates G1–G7. Gate status is explicitly **not satisfied**: constitution/plan/tasks and schema/write-path approvals are unrecorded; open decisions are not explicitly confirmed; no staging environment or staging smoke test exists; staging/production resource isolation is unverified; D1 Time Travel restore and Worker rollback were not tested; remote D1/Queues and real Google/messaging providers were not exercised; CI was not executed in this session; alert paging is not configured; and the FreshFold UI package/screens are absent. No production-ready claim is made and no production deployment was performed. **Production approval: NOT GRANTED.** This status records review completion only, not acceptance of T-120's readiness gates.

**Later status note (2026-11-11):** Stage A recorded Phase 1 approval and added the `@freshfold/ui` package plus a mock-backed Dashboard. The production-readiness conclusion and NOT GRANTED status remain unchanged; schema/write-path approvals, the remaining screens, production API integration, staging, and deployment approval are still outstanding.

---

## Stage A: FreshFold frontend scaffold (approved 2026-11-11)

Stage A is limited to frontend, build, static-asset, and documentation work. It does not approve backend business-logic changes, D1 migrations, remote resource creation, or deployment.

### T-130: Phase 1 and Stage A approval record

**Phase:** Stage A
**Status:** done
**Description:** Record Phase 1 and Stage A approval in the governing documents without rewriting architectural content or treating open decisions as resolved.

**Files changed:**
- `specs/constitution.md`
- `specs/plan.md`
- `specs/tasks.md`
- `docs/adr/README.md`

**Acceptance criteria:**
- Phase 1 approval is recorded with a date.
- Stage A scope is identified as frontend-only.
- Open decisions and proposed ADRs remain visibly open.

**Automated tests:** Documentation review only.

**Completion evidence:** Status and approval headers updated on 2026-11-11. The ADR index records Phase 1 approval while preserving each ADR's own decision status.

---

### T-131: FreshFold UI workspace package

**Phase:** Stage A
**Status:** done
**Description:** Create the mandatory `@freshfold/ui` workspace package with semantic tokens, Tailwind theme exposure, shared layout, controls, display, feedback, and a stable public API.

**Files changed:**
- `packages/freshfold-ui/package.json`
- `packages/freshfold-ui/tsconfig.json`
- `packages/freshfold-ui/src/styles/tokens.css`
- `packages/freshfold-ui/src/styles/globals.css`
- `packages/freshfold-ui/src/components/layout/`
- `packages/freshfold-ui/src/components/primitives/`
- `packages/freshfold-ui/src/components/data-display/`
- `packages/freshfold-ui/src/components/feedback/`
- `packages/freshfold-ui/src/index.ts`

**Acceptance criteria:**
- Tokens match the constitution and are exposed through Tailwind.
- The public API exports layout, controls, display, and feedback components.
- No backend, Cloudflare binding, or domain business-logic imports exist in the package.
- Component behavior is covered by jsdom + Testing Library tests.

**Automated tests:** `pnpm test:web` (shared UI suites) and `pnpm typecheck`.

**Completion evidence:** Shared UI tests and the Dashboard suite passed locally (5 files / 34 tests); `pnpm typecheck` passed. The package exports only `@freshfold/ui` paths and CSS style entries.

---

### T-132: Web scaffold and Dashboard

**Phase:** Stage A
**Status:** done
**Description:** Scaffold React + TypeScript + Vite + Tailwind in `apps/web`, add the router and FreshFold shell, separate typed mock adapter, Dashboard, and responsive/accessibility states.

**Files changed:**
- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `apps/web/vitest.config.ts`
- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/index.css`
- `apps/web/src/mocks/`
- `apps/web/src/features/dashboard/`
- `apps/web/src/features/shared/`
- `apps/web/src/hooks/`
- `apps/web/src/lib/`
- `workers/gateway/wrangler.jsonc`

**Acceptance criteria:**
- Dashboard shows summary, attention items, recent orders, and quick actions.
- Mock data lives in `apps/web/src/mocks/`, not components.
- Loading, empty, error, offline, pending-sync, conflict, and success states exist.
- Desktop, tablet, and mobile layouts use the FreshFold tokens.
- The production build output is served by the Gateway static assets binding.

**Automated tests:** Dashboard screen tests with injected mock API; `pnpm build:web`.

**Completion evidence:** `pnpm build:web` produced `apps/web/dist/index.html`, hashed CSS, and hashed JS. Gateway `assets.directory` now points to `../../apps/web/dist`. The Dashboard suite covers loading, success, empty, error, offline, pending, and conflict states.

---

### T-133: Stage A verification

**Phase:** Stage A
**Status:** done
**Description:** Run the full local verification set and record evidence without deploying or committing.

**Acceptance criteria:**
- `pnpm check` passes, including Workers, shared UI, web tests, web typecheck, and web build.
- All six Worker dry-runs pass after the Gateway static-asset change.
- Secret scan finds no real credentials or customer data.
- `git status --short` is reviewed and no commit is created.

**Automated tests:** The commands listed above.

**Completion evidence:** `pnpm check` passed: all typechecks, root Vitest 55 files / 326 tests, web Vitest 5 files / 34 tests, and `vite build` produced `apps/web/dist` (`index.html`, 27.90 kB CSS, 291.75 kB JS). All six `wrangler deploy --dry-run` commands passed. The Vite dev server returned HTTP 200 for `/`, and the Gateway served the built app locally with `/assets/index-*.js` and `/assets/index-*.css`. The secret regex scan found only the existing intentional Bearer fixture in `tests/unit/notification-client.test.ts`; no real credential was found. `git status --short` was reviewed and no commit was created. Pre-existing uncommitted changes in `workers/auth/src/index.ts` and `tests/workers/module-exports.test.ts` were left untouched.

---

## Stage C: Production API integration, auth and offline UX (approved 2026-11-11)

Stage C is frontend-only. It adds a typed Gateway client, login/session handling, a mock/live adapter switch, offline queue integration, and UI states. It does not change backend business logic, add backend endpoints, apply remote migrations, create remote resources, deploy, or commit.

### T-150: Typed Gateway API client

**Phase:** Stage C
**Status:** done
**Description:** Add a typed client under `apps/web/src/api` for auth/session, customers, orders, changes/events, and `apply-change`, separate from the mock adapter.

**Files changed:**
- `apps/web/src/api/client.ts`
- `apps/web/src/api/client.test.ts`
- `apps/web/src/sync/fetch.ts`

**Acceptance criteria:**
- Login, logout, session bootstrap, customers list/detail, orders list/detail, changes, order events, and apply-change are typed through shared contracts.
- Requests include credentials and request IDs; state-changing requests include `x-csrf-token`.
- 401/403/404/409/422/429/5xx, invalid responses, network failures, timeouts, and caller aborts map to a typed error.
- A version conflict preserves the canonical server order.

**Completion evidence:** `apps/web/src/api/client.test.ts` passes 15 tests covering login/CSRF reuse, cookie CSRF recovery, safe-method exemption, logout, read query construction, error mapping, retry classification, timeout, and caller abort. The CSRF cookie fallback allows a page reload to recover the double-submit token without localStorage.

### T-151: Mock/live adapter switch and fallback isolation

**Phase:** Stage C
**Status:** done
**Description:** Add a `VITE_API_MODE` switch and a live adapter that implements the existing UI data contract while keeping missing endpoints isolated.

**Files changed:**
- `apps/web/src/api/adapters.ts`
- `apps/web/src/api/types.ts`
- `apps/web/src/api/mappers.ts`
- `apps/web/src/api/fallbacks.ts`
- `apps/web/src/api/context.tsx`
- `apps/web/src/api/adapters.test.ts`
- `apps/web/src/db/memory.ts`
- `apps/web/src/mocks/api.ts`
- `apps/web/src/mocks/context.tsx`
- `apps/web/src/mocks/errors.ts`
- `apps/web/src/mocks/types.ts`

**Acceptance criteria:**
- Mock mode remains the default and still uses isolated sample data.
- Live mode uses Gateway endpoints for session, customers, orders, changes, events, and apply-change.
- Delivery-slot listing and service names are unavailable by default or explicitly labelled demo fallbacks.
- Customer create/update stays unavailable; customer order history is an explicitly labelled scan of the order list.
- Client-supplied roles are never trusted in live mode.

**Completion evidence:** `apps/web/src/api/adapters.test.ts` passes 8 tests for config defaults, mock/live separation, mock auth gating, live session/orders/customers reads, fallback capability labels, live CSRF flush, live version-conflict preservation, and provisional offline updates. The live adapter merges IndexedDB-local pending/conflict state into reads and writes canonical server state only after acceptance.

### T-152: Login, session bootstrap and role-aware shell

**Phase:** Stage C
**Status:** done
**Description:** Add the FreshFold login screen, session provider, logout, role-aware shell, and reconnect flush wiring.

**Files changed:**
- `apps/web/src/auth/AuthContext.tsx`
- `apps/web/src/features/auth/LoginPage.tsx`
- `apps/web/src/features/auth/LoginPage.test.tsx`
- `apps/web/src/auth/AuthContext.test.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`

**Acceptance criteria:**
- Login uses FreshFold components with labelled fields, visible validation, loading, and safe error messages.
- Session bootstrap shows loading/error/retry and unauthenticated/login states.
- Logout clears the session; live roles come only from the server session.
- Role changes and manager-only actions remain consistent with the backend permission matrix.
- Pending mutations flush on reconnect.

**Completion evidence:** `LoginPage.test.tsx` (4), `AuthContext.test.tsx` (4) and `App.test.tsx` (2) pass. A server 401 returns the shell to the login screen. The shell hides the mock role switch in live mode, keeps reschedule/cancel manager-only, and flushes the queue on the browser `online` event. No browser E2E or real session cookie flow was run.

### T-153: Offline and conflict UI integration

**Phase:** Stage C
**Status:** done
**Description:** Wire the existing IndexedDB mutation queue into create, reschedule, hold/status flows and expose pending/rejected/conflict states without false confirmation.

**Files changed:**
- `apps/web/src/features/orders/OrderDetailPage.tsx`
- `apps/web/src/features/orders/OrderDetailPage.test.tsx`
- `apps/web/src/features/orders/CreateOrderPage.tsx`
- `apps/web/src/features/orders/CreateOrderPage.test.tsx`
- `apps/web/src/features/orders/RescheduleDialog.tsx`
- `apps/web/src/features/dashboard/Dashboard.tsx`
- `apps/web/src/features/deliveries/DeliveriesPage.tsx`
- `apps/web/src/features/customers/CustomerDetailPage.tsx`

**Acceptance criteria:**
- Offline create/update writes the optimistic order and stable mutation before submission.
- Pending changes are never described as server-confirmed.
- Rejected and conflicting mutations remain visible for review.
- Per-order submission order and stable mutation IDs are preserved.
- Missing delivery-slot/customer-history capabilities are surfaced honestly.

**Completion evidence:** Order detail tests cover provisional status and reschedule changes, rejected mutations, and conflicts. Create-order tests cover offline creation followed by a pending detail view. Existing data-layer tests cover per-order ordering, stable mutation IDs, conflict/rejection preservation, and reconnect flush. Live create/reschedule are blocked with a clear message when delivery slots are unavailable, because the backend has no slot-listing endpoint.

### T-154: Stage C verification

**Phase:** Stage C
**Status:** done
**Description:** Run local typecheck, test, build, browser-server, secret-scan and git-status checks without deploying or committing.

**Acceptance criteria:**
- Web typecheck, web tests, and production build pass.
- `pnpm check` passes.
- Local Vite serves the key routes with HTTP 200.
- Secret scan finds no real credentials.
- `git status` is reviewed and no commit is created.

**Completion evidence:** `pnpm check` passed: all typechecks; root Vitest 55 files / 326 tests; web Vitest 16 files / 107 tests; `vite build` produced `apps/web/dist/index.html`, 29.37 kB CSS, and 476.24 kB JS. The local Vite server returned HTTP 200 for `/`, `/orders`, `/orders/new`, `/orders/ORD-1042`, `/deliveries`, `/customers`, and `/customers/C-238`. The secret scan found no matches in non-test web/UI source. `git status --short` was reviewed and no commit was created.

Not verified: real browser IndexedDB persistence, real network calls to a running Gateway, real login cookies/CSRF over HTTPS, staging credentials, browser visual regression, or any remote Cloudflare resource. Pre-existing uncommitted repository changes were left untouched.
