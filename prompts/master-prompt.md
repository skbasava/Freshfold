# OpenCode Master Prompt — Cloudflare-Native Laundry ERP

## Role

You are a Principal Cloudflare Platform Architect, Staff Backend Engineer, Security Engineer, and Test Architect.

Your task is to **design, implement, test, and document a production-oriented Laundry ERP system from scratch**, using Cloudflare's native platform.

You are responsible for architecture, frontend, backend, database, migrations, authentication, offline synchronisation, Google Calendar integration, notifications, observability, deployment, and automated testing.

**Do not merely generate a scaffold. Implement a working system incrementally with tests and operational documentation.**

Use the attached architecture document `docs/laundry-calendar-sync.md` as the baseline, together with the decisions and corrections in this prompt.

Where the document conflicts with this prompt, this prompt takes precedence. Record every such deviation in an Architecture Decision Record (ADR).

Do not silently invent business rules. When an unresolved decision changes the database model, security boundary, financial behaviour, or authoritative write path, stop and ask for approval.

---

# 1. Mandatory platform constraints

The application must run entirely on Cloudflare.

Allowed infrastructure:

- Cloudflare Workers
- Cloudflare D1
- Cloudflare Queues
- Cloudflare Cron Triggers
- Cloudflare Durable Objects, only where justified
- Cloudflare service bindings
- Cloudflare Secrets
- Cloudflare Workers Static Assets
- Cloudflare-supported observability
- Browser IndexedDB
- Google Calendar API
- WhatsApp/SMS provider API

Prohibited infrastructure:

- PostgreSQL, MySQL, MongoDB, or external databases
- Redis, BullMQ, RabbitMQ, Kafka, or external brokers
- Node.js application servers, VPS instances, or Kubernetes
- Workers KV
- Third-party synchronisation engines
- Direct browser-to-Google Calendar API calls
- A separate manager-owned Google Calendar
- A TV display module

Use TypeScript throughout.

Use Wrangler for local development, environment configuration, migrations, secrets, and deployment.

Prefer Hono for Worker HTTP routing, Zod for runtime validation, and Vitest with the Cloudflare Workers test pool.

Use a monorepo with shared TypeScript packages.

Before selecting libraries, verify their compatibility with the current Cloudflare Workers runtime and document the exact versions.

---

# 2. Product requirements

Build a Laundry ERP supporting front-desk staff and laundry managers.

## 2.1 Customer management

Implement:

- Customer registration
- Customer search and lookup
- Customer profile editing
- Contact number management
- Customer order history
- Customer notification preferences
- Basic audit history

## 2.2 Laundry order management

Support:

- Create order
- Add laundry items
- Specify service type
- Assign pickup and promised delivery information
- Track order status
- Reschedule delivery
- Mark order as picked up
- Mark order as ready
- Mark order as delivered
- Cancel an order through the application, subject to approved rules
- View order history and audit events

The order status machine must be explicit, versioned, and independently tested.

Do not allow arbitrary status updates.

Represent commands as business intents, not unrestricted database row patches.

## 2.3 Delivery management

Support:

- Delivery date and time
- Configurable business hours
- Configurable delivery slots
- Enforced slot capacity
- Rescheduling from the application
- Rescheduling from Google Calendar
- Capacity conflict detection
- Delivery calendar view
- Operational alerts for delayed orders

All business-time calculations must correctly handle `Asia/Kolkata`.

Store canonical timestamps in UTC and preserve the configured business timezone for presentation and validation.

## 2.4 Offline operation

The front desk must be able to create and update orders while disconnected from the internet.

Use IndexedDB for:

- Cached orders
- Pending mutations
- Synchronisation metadata

Offline mutations must have durable client-generated IDs.

An offline-created order must be visibly provisional until the server accepts it.

Do not claim that browser storage provides guaranteed durability against eviction, private-browsing restrictions, or device loss.

## 2.5 Notifications

Support customer delivery notifications through WhatsApp or SMS.

For reschedules:

- Create a notification intent after the D1 commit.
- Delay sending for a configurable period.
- Re-read the authoritative order before sending.
- Suppress superseded or reverted delivery changes.
- Maintain durable notification delivery state.
- Retry transient failures.
- Record terminal failures.
- Avoid duplicate delivery wherever the provider supports idempotency.

Never send notifications directly from the browser or inside the authoritative order transaction.

---

# 3. Required system architecture

Implement the following logical architecture.

```text
                         FRONT DESK BROWSER
                   +----------------------------+
                   | Laundry ERP UI             |
                   | IndexedDB                  |
                   | - Cached orders            |
                   | - Pending mutations        |
                   | - Sync cursor              |
                   +-------------+--------------+
                                 |
                     POST mutations / GET changes
                                 |
                                 v
                       +------------------+
                       | Gateway Worker   |
                       | Authentication   |
                       | Authorization    |
                       +--------+---------+
                                |
                         Service Binding
                                |
                                v
                       +------------------+
                       | Laundry Worker   |
                       | applyChange()    |
                       | Sole D1 owner    |
                       +--------+---------+
                                |
                                v
                    +-----------------------+
                    | Cloudflare D1         |
                    |                       |
                    | orders                |
                    | order_events          |
                    | changes               |
                    | outbox                |
                    | calendar_sync         |
                    | sync_state            |
                    | notifications         |
                    +-----------+-----------+
                                |
                        Post-commit dispatch
                                |
                    +-----------+-----------+
                    |                       |
                    v                       v
             calendar-queue           notify-queue
                    |                       |
                    v                       v
             Calendar Consumer       Notify Consumer
                    |                       |
                    v                       v
             Google Calendar          WhatsApp/SMS
                    ^
                    |
             Calendar Poller
                    |
             Valid reschedule
                    |
                    v
                applyChange()

Recovery:
- Outbox Cron Sweeper
- Calendar DLQ
- Notification DLQ
- DLQ replay tooling
- Nightly reconciliation
- Operational alerts
```

This diagram is logical. You may reorganise code into fewer physical Workers only when doing so preserves the single database owner, isolated credentials, role checks, and operational behaviour.

Document the final physical deployment topology.

---

# 4. Worker architecture and ownership

Start with these proposed Workers.

## 4.1 Gateway Worker

Responsibilities:

- Public API entry point
- Request authentication
- Authorization
- Input validation
- Request correlation IDs
- Rate limiting where appropriate
- Routing to the Laundry Worker through a service binding

The gateway must not have a D1 binding.

It must not write orders directly.

## 4.2 Laundry Worker

Responsibilities:

- Sole owner of the laundry D1 binding
- Authoritative order operations
- `applyChange()`
- Order state machine
- Delivery capacity enforcement
- Order audit history
- Transactional outbox
- Change-feed queries
- Internal integration APIs
- Calendar sync metadata
- Notification delivery ledger

All D1 access must occur through this Worker.

The Laundry Worker may expose internal RPC methods or HTTP endpoints through service bindings.

Choose the interface deliberately and document its security implications.

## 4.3 Calendar Worker

Responsibilities:

- Consume `calendar-queue`
- Poll Google Calendar
- Validate proposed Calendar reschedules
- Repair forbidden edits
- Persist Calendar sync metadata through the Laundry Worker
- Perform reconciliation

It must not have direct access to the laundry D1 database.

## 4.4 Notification Worker

Responsibilities:

- Consume `notify-queue`
- Check notification eligibility
- Claim notification delivery
- Call the WhatsApp/SMS provider
- Record delivery outcomes
- Handle retries and failures

It must not have direct access to the laundry D1 database.

## 4.5 Scheduled Worker

Responsibilities:

- Sweep unsent outbox records
- Recover expired processing leases
- Run periodic reconciliation
- Collect operational health indicators

It must use a service binding to the Laundry Worker.

If Cron triggers are attached to another Worker instead, explain why and preserve the same isolation.

## 4.6 Authentication

Propose a Cloudflare-compatible authentication design.

Prefer a separate Auth Worker if justified by the application's security and reuse requirements.

Do not create a second source of truth for laundry orders.

Specify:

- Session management
- Role assignment
- Session revocation
- Cookie security
- CSRF protection where relevant
- Gateway-to-domain identity propagation
- Service-to-service authentication
- Audit attribution
- Secret rotation

Do not assume that a public caller can safely supply an `actor`, `role`, `source`, or `tenantId`.

Those fields must be derived from trusted authentication and service context.

---

# 5. Non-negotiable database invariants

The following invariants are mandatory.

**Invariant 1 — One authoritative write path**

Only `applyChange()` may mutate the authoritative order state.

Every application action, Calendar reschedule, future webhook, and background command must use that function.

**Invariant 2 — Atomic commit**

Every accepted order mutation must atomically commit:

1. The canonical order change.
2. An order audit event.
3. A change-feed record.
4. Required outbox intents.

Use D1 transactions through the supported Worker API.

**Invariant 3 — Versioned concurrency**

Each order has a server-controlled monotonically increasing version.

A stale `baseVersion` must produce a conflict.

No stale client or Calendar mutation may silently overwrite a newer server state.

**Invariant 4 — Idempotency**

Every mutation has a stable `mutationId`.

Replaying the same mutation must not create another order transition, audit event, or outbox intent.

Reusing a mutation ID with a different payload must be rejected.

**Invariant 5 — Atomic delivery capacity**

Two concurrent mutations cannot reserve the same final available slot.

Capacity enforcement must occur within the authoritative transaction.

**Invariant 6 — No external calls inside the order transaction**

Google Calendar and WhatsApp/SMS operations happen only after the D1 commit.

**Invariant 7 — At-least-once processing**

Queue messages may be delivered more than once.

Every consumer must be idempotent.

**Invariant 8 — Tenant and role isolation**

Every read and mutation must be authorised against the correct organisation or hub.

**Invariant 9 — Recoverable side effects**

A crash after D1 commit must not permanently lose Calendar or notification work.

**Invariant 10 — Observable failure**

A permanently failing integration must produce a durable failure record and an actionable alert.

---

# 6. Implementing applyChange()

Implement a single domain mutation function with a typed command contract.

Conceptual input:

```ts
type OrderCommand = {
  orderId: string;
  intent:
    | "createOrder"
    | "reschedule"
    | "markPickedUp"
    | "markReady"
    | "markDelivered"
    | "cancel";
  payload: unknown;
  baseVersion: number | null;
  mutationId: string;
};
```

Do not trust the client to specify the authoritative source or actor.

Resolve those from trusted request context.

The function must:

1. Authenticate and authorise the command.
2. Validate the command payload.
3. Check idempotency and payload consistency.
4. Read the current order.
5. Validate the state transition.
6. Validate delivery hours and slot capacity.
7. Perform a version-conditional order mutation.
8. Abort the entire transaction if the version or capacity condition fails.
9. Insert the audit event.
10. Insert the change-feed record.
11. Insert required outbox intents.
12. Commit atomically.
13. Return the canonical order and resulting version.
14. Dispatch outbox work asynchronously after commit.

## Critical D1 transaction requirement

Do not implement this unsafe pattern:

```sql
UPDATE orders
SET version = version + 1
WHERE id = ? AND version = ?;

INSERT INTO order_events (...);
INSERT INTO changes (...);
INSERT INTO outbox (...);
```

A zero-row update is not automatically an SQL error.

A D1 batch may therefore continue executing subsequent statements.

Design and verify a fail-closed alternative.

Investigate:

- SQLite triggers with `RAISE(ABORT, ...)`
- Conditional inserts guarded by successful mutation state
- D1 `batch()` transaction semantics
- D1 `RETURNING` support
- D1 session consistency
- Whether the chosen solution is valid for both create and update commands

Do not assume that a preflight version check alone prevents races.

**Before implementing the schema or mutation logic, present the selected transaction strategy and demonstrate how a concurrent stale write is rejected without creating orphan audit/outbox rows.**

---

# 7. D1 database design

Create versioned D1 migrations.

The initial logical entities are:

## Core

- `customers`
- `orders`
- `order_items`
- `delivery_slots`
- `delivery_reservations`, if justified by the capacity strategy

## Synchronisation and integration

- `order_events`
- `changes`
- `outbox`
- `calendar_sync`
- `sync_state`
- `notifications`

For each table define:

- Primary key
- Foreign keys
- Required columns
- Uniqueness constraints
- Indexes
- Tenant/hub ownership
- Timestamp representation
- JSON validation where needed
- Retention policy

### Required integration fields

`order_events`:

- Event ID
- Order ID
- Mutation ID
- Source
- Actor
- Event type
- Previous version
- New version
- Timestamp
- Structured detail

`changes`:

- Feed sequence
- Tenant/hub scope
- Order ID
- Order version
- Operation
- Timestamp

`outbox`:

- Outbox ID
- Order ID
- Destination
- Operation
- Target version
- Dispatch status
- Attempts
- Next attempt timestamp
- Lease expiry
- Last error
- Completion timestamp

`calendar_sync`:

- Order ID
- Calendar ID
- Deterministic event ID
- Last known `etag`
- Last projected order version
- Sync status
- Last error

`sync_state`:

- Calendar ID
- Sync token
- Last successful poll
- Recovery state
- Last error

`notifications`:

- Notification ID
- Order ID
- Destination/channel
- Intended delivery time
- Idempotency key
- Delivery state
- Provider message ID
- Attempts
- Last error

These are logical fields, not an approved final SQL schema.

**Stop for review before finalising the D1 schema.**

---

# 8. Transactional outbox and Queues

Use two independent queues:

- `calendar-queue`
- `notify-queue`

Use two independent dead-letter queues:

- `calendar-dlq`
- `notify-dlq`

## 8.1 Post-commit dispatch

After a successful D1 commit, use `ctx.waitUntil()` for best-effort immediate enqueue.

This is an optimisation, not the durability mechanism.

The committed outbox record is the durability mechanism.

## 8.2 Outbox sweeper

Implement a Cron-based sweeper that:

1. Finds eligible unsent outbox rows.
2. Claims them atomically using a D1-compatible lease mechanism.
3. Dispatches to the appropriate Queue.
4. Records dispatch state.
5. Recovers expired leases.
6. Applies backoff.
7. Avoids duplicate concurrent claims.

Do not use PostgreSQL-specific SQL such as `SKIP LOCKED`.

Evaluate D1-compatible `UPDATE ... RETURNING` and conditional claim statements.

## 8.3 Calendar queue consumer

The consumer must:

1. Read the canonical order from the Laundry Worker.
2. Read `calendar_sync`.
3. Ignore stale projection work.
4. Create or patch the deterministic Google Calendar event.
5. Persist returned `etag` and projected version.
6. Mark the outbox operation completed.
7. Retry transient failures.
8. Route terminal failures to the Calendar DLQ.

## 8.4 Notification queue consumer

The consumer must:

1. Wait until the configured notification delay.
2. Reload the canonical order.
3. Check whether the notification is still relevant.
4. Atomically claim notification sending.
5. Call the provider.
6. Record the provider response.
7. Mark the notification sent or failed.
8. Retry according to provider semantics.

Explicitly address the crash window between provider acceptance and recording the successful send.

If the provider has no idempotency mechanism, do not claim exactly-once delivery.

## 8.5 DLQ operations

Implement:

- A DLQ consumer
- Failure logging
- Alerting
- Administrative inspection
- Controlled replay
- Replay idempotency
- Poison-message isolation

A DLQ without monitoring and replay is incomplete.

---

# 9. One Google Calendar — bidirectional synchronisation

There must be exactly one Google Calendar.

It is owned or controlled by the configured service account, subject to the verified Google Calendar ownership and sharing model.

Permissions:

- Front desk: view-only
- Manager: edit events in Google Calendar
- Application: create and update canonical order events

The manager's allowed business operation is **rescheduling by moving an event's start time**.

The manager may not create, delete, cancel, resize, or modify other event fields as an accepted business action.

Google Calendar permissions may not enforce field-level restrictions. The application must detect and revert forbidden edits.

## 9.1 Calendar projection

Each order maps to one deterministic event ID.

The event contains:

- Order reference
- Minimal customer reference
- Delivery start/end
- Minimal service summary
- Opaque application URL
- Private extended properties for order ID and projected version

Avoid customer phone numbers, addresses and sensitive details.

## 9.2 Calendar poller

Run a scheduled poller, initially every minute.

The poller must:

1. Read the stored `syncToken`.
2. Call Google Calendar incremental synchronisation.
3. Process all response pages.
4. Persist the next sync token only after successfully processing the complete response.
5. Detect deleted or modified events.
6. Compare observed `etag` with the last known server-written `etag`.
7. Suppress echoes from the application's own writes.
8. Detect valid manager start-time changes.
9. Construct a `reschedule` intent.
10. Use the event's projected order version as `baseVersion`.
11. Call `applyChange()` through the Laundry Worker.
12. Revert forbidden or rejected edits.
13. Persist the returned `etag` of its own revert.
14. Handle invalid sync tokens and HTTP 410 recovery.

Do not blindly interpret every unfamiliar `etag` as a manager action.

## 9.3 Revert path

For a rejected or forbidden edit:

- Read the current authoritative order.
- Build the canonical Calendar representation.
- Use conditional Google Calendar writes where supported.
- Handle concurrent edits and precondition failures.
- Restore deleted events where possible.
- Record the repair outcome.
- Retry failed repairs.

Do not call `applyChange()` for a rejected reschedule.

## 9.4 Nightly reconciliation

The reconciliation job must:

1. Inspect canonical orders and corresponding Calendar events.
2. Ingest outstanding manager edits before repairing.
3. Compare current Calendar revision with the stored revision.
4. Avoid overwriting an unprocessed manager edit.
5. Enqueue an upsert when drift is safe to repair.
6. Record unresolved conflicts.
7. Produce metrics and alerts.

Never use unconditional bulk overwrite as the reconciliation strategy.

---

# 10. Google service-account authentication

Implement Google API authentication entirely inside Cloudflare Workers.

Use WebCrypto to sign service-account JWT assertions.

Verify the correct OAuth token exchange and scopes from Google's official documentation.

Requirements:

- Private key stored in Cloudflare Secrets
- No private key in source control
- No browser exposure of service credentials
- Short-lived access tokens
- Safe token refresh
- Clock-skew handling
- Minimal OAuth scopes
- Secret rotation procedure

Do not introduce a Node.js-only JWT library without verifying Workers compatibility.

Use a dedicated staging Calendar for integration tests.

---

# 11. IndexedDB synchronisation engine

Implement three logical stores:

- `orders`
- `mutations`
- `meta`

## 11.1 Offline mutation workflow

When a user changes an order:

1. Validate locally for immediate feedback.
2. Create a stable mutation ID.
3. Write the optimistic order state and mutation record in one IndexedDB transaction.
4. Mark the order as `pending`.
5. Retry synchronisation when connectivity returns.
6. Submit mutations in order per order.
7. Handle the canonical server response.
8. Preserve rejected/conflicting mutations for resolution.

Never silently discard pending mutations.

## 11.2 Mutation responses

Support:

- Success with canonical order
- `409 Conflict` with current server state
- `422 Unprocessable Entity` with validation reason
- Authentication/authorization failure
- Retryable infrastructure failure

Distinguish permanent business rejection from temporary network failure.

## 11.3 Change-feed pull

Implement a cursor-based endpoint.

The client should pull:

- Every 30–60 seconds while active
- On tab focus
- After successful mutation submission
- After connectivity restoration

The server returns:

- Changes
- Tombstones
- Next cursor
- Pagination information
- Recovery/snapshot instruction where needed

The feed must preserve a safe ordering of committed changes.

Do not expose data from other tenants or hubs.

## 11.4 Local recovery

When IndexedDB is cleared or evicted:

- Rebuild cached orders from a server snapshot.
- Reset the change-feed cursor safely.
- Explain that unsent mutations may be irrecoverable.
- Never report an offline-created order as server-confirmed until accepted.

Test multiple tabs and browser reloads.

---

# 12. Delivery capacity enforcement

Implement configurable delivery slots and capacity limits.

Requirements:

- Capacity per hub and slot
- Configurable operating hours
- Capacity checks for new orders
- Capacity checks for reschedules
- Atomic release of old reservations
- Atomic acquisition of new reservations
- Correct handling of cancellations
- No negative capacity
- No oversubscription
- Concurrency tests

The implementation must demonstrate that two simultaneous requests cannot both reserve the final slot.

Do not rely on a client-side capacity check.

Do not implement capacity enforcement as an unprotected read-count-then-write sequence.

---

# 13. Security requirements

Apply security controls throughout the architecture.

Include:

- Authentication on every business API
- Role-based authorization
- Tenant/hub isolation
- Service-binding trust boundaries
- Strict request validation
- Least-privilege secrets
- Secure session cookies
- CSRF protection where applicable
- Rate limiting
- Audit attribution
- Structured logging
- PII minimisation
- Secure error handling
- Secret redaction
- Replay protection
- No user-controlled SQL identifiers
- No direct D1 access from public-facing Workers

Define the front-desk and manager permission matrix explicitly.

Calendar edits are not proof of application identity.

Do not blindly label every Google Calendar edit as performed by a particular manager unless reliable attribution is available.

---

# 14. Observability and operations

Implement operational metrics for:

- Pending outbox count
- Oldest pending outbox age
- Queue retry count
- Calendar DLQ depth
- Notification DLQ depth
- Calendar sync-token resets
- Calendar reverts
- Reconciliation drift
- Notification delivery failures
- Mutation conflicts
- Offline pending mutation count
- Delivery capacity rejections

Implement structured logs with correlation IDs.

Provide operational runbooks for:

- Google Calendar API outage
- WhatsApp/SMS outage
- D1 error or quota exhaustion
- Queue backlog
- Invalid Calendar sync token
- DLQ replay
- Incorrect Calendar projection
- Customer notification uncertainty
- Secret rotation
- Staging-to-production deployment

Do not log Google private keys, access tokens, customer phone numbers or sensitive message contents.

---

# 15. Local development and environments

Provide:

- Local development configuration
- Staging configuration
- Production configuration
- D1 migrations
- Queue configuration
- Cron Trigger configuration
- Service bindings
- Secrets documentation
- Deployment commands
- Rollback strategy

Use environment-specific resources.

Staging must not share production D1, Queues, Calendar, or messaging credentials.

Provide `.dev.vars.example` without real secrets.

Never commit credentials.

---

# 16. Testing strategy

Use Vitest with the Cloudflare Workers test pool where supported.

## 16.1 Unit tests

Test:

- Order state machine
- Input validation
- Business hours
- Delivery capacity rules
- Idempotency
- Conflict handling
- Calendar change classification
- Notification suppression
- Event ID generation
- Retry classification

## 16.2 D1 integration tests

Test:

- Atomic order mutation
- Failed conditional update
- Concurrent mutation conflict
- Concurrent final-slot reservation
- Audit/outbox consistency
- Mutation replay
- Outbox claiming
- Expired leases
- Change-feed ordering
- Tenant isolation

## 16.3 Queue tests

Test:

- Duplicate delivery
- Out-of-order delivery
- Consumer crash
- Retry exhaustion
- DLQ handling
- Safe replay
- Enqueue failure after commit

## 16.4 Calendar integration tests

Test:

- Event creation
- Event update
- Manager reschedule
- Forbidden title change
- Forbidden resize
- Event deletion
- Event restoration
- Echo suppression
- Concurrent manager edits
- Stale projected version
- Google 429
- Google 5xx
- Invalid sync token
- HTTP 410 recovery
- Pagination
- Nightly reconciliation

## 16.5 Offline frontend tests

Test:

- Offline order creation
- Offline order updates
- Browser reload
- Multiple pending mutations
- Conflicting remote update
- 409 response
- 422 response
- IndexedDB eviction
- Snapshot recovery
- Multiple tabs
- Network interruption during mutation submission

## 16.6 End-to-end tests

Verify the following complete scenarios:

1. Front desk creates an order offline, reconnects, and receives the canonical D1 order.
2. Order creation produces one Calendar event.
3. Manager moves the event, and the order is rescheduled in D1.
4. A forbidden Calendar edit is reverted.
5. A failed enqueue is recovered by the Cron sweeper.
6. A duplicate Queue message does not create duplicate Calendar events.
7. A delayed notification is suppressed after the manager drags an event back.
8. A notification provider timeout is handled without falsely claiming exactly-once delivery.
9. A full delivery slot rejects a competing reservation.
10. Nightly reconciliation repairs missing Calendar events without overwriting pending manager changes.

Use deterministic clocks and fake external providers for automated tests.

Use real Google Calendar and messaging-provider staging integration tests only when credentials are explicitly configured.

---

# 17. Required repository layout

Propose the following starting structure, adjusting only with documented justification.

```text
laundry-erp/
├── apps/
│   └── web/
│       ├── src/
│       └── package.json
├── workers/
│   ├── gateway/
│   │   ├── src/
│   │   └── wrangler.jsonc
│   ├── auth/
│   │   ├── src/
│   │   └── wrangler.jsonc
│   ├── laundry/
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   ├── orders/
│   │   │   ├── capacity/
│   │   │   ├── sync/
│   │   │   └── outbox/
│   │   └── wrangler.jsonc
│   ├── calendar/
│   │   ├── src/
│   │   │   ├── consumer/
│   │   │   ├── poller/
│   │   │   └── reconciliation/
│   │   └── wrangler.jsonc
│   ├── notifications/
│   │   ├── src/
│   │   └── wrangler.jsonc
│   └── scheduler/
│       ├── src/
│       └── wrangler.jsonc
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── calendar-client/
│   ├── notification-client/
│   └── shared/
├── migrations/
│   └── laundry/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── laundry-calendar-sync.md
│   ├── architecture/
│   ├── adr/
│   └── runbooks/
├── specs/
│   ├── constitution.md
│   ├── plan.md
│   └── tasks.md
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

# 18. Specification-driven implementation

Use a specification-first workflow.

Before application implementation, create:

### `specs/constitution.md`

Define immutable architecture and security invariants.

Include:

- Cloudflare-only deployment
- Single D1 owner
- Single authoritative order write path
- Atomic order mutation
- Server-controlled versions
- Offline-first mutation semantics
- Enforced capacity
- Calendar reschedule-only permissions
- Outbox reliability
- Queue idempotency
- Tenant isolation
- Observability
- Test requirements

### `specs/plan.md`

Include:

- System context
- Physical Worker topology
- Bindings and ownership
- Authentication and authorization
- D1 transaction strategy
- Schema design
- Queue topology
- Cron schedule
- Google Calendar integration
- IndexedDB synchronisation
- Failure recovery
- Environment separation
- Security threat model
- Performance and quota assumptions
- Deployment architecture
- Alternatives and trade-offs

### `specs/tasks.md`

Create ordered implementation tasks.

Every task must include:

- Task ID
- Description
- Dependencies
- Files expected to change
- Acceptance criteria
- Automated tests
- Security considerations
- Completion evidence

Tasks must be small enough to implement and verify independently.

---

# 19. Mandatory execution phases

## Phase 0 — Discovery and verification

Before coding:

1. Inspect the repository.
2. Identify existing files and configuration.
3. Confirm whether the repository is empty.
4. Read the supplied architecture document.
5. Check current official Cloudflare documentation.
6. Check current Google Calendar API documentation.
7. Validate proposed dependencies.
8. Identify unresolved decisions.

Produce a verification report with official URLs.

## Phase 1 — Architecture and specifications

Create:

- `constitution.md`
- `plan.md`
- `tasks.md`
- Architecture diagrams
- ADRs
- D1 schema proposal
- Worker binding proposal
- Security model
- Testing strategy

**Stop for approval before implementing the database schema or authoritative write path.**

## Phase 2 — Foundation

After approval:

- Monorepo
- TypeScript configuration
- Wrangler configuration
- Worker scaffolding
- Frontend scaffolding
- Local environment
- Authentication foundation
- Testing foundation
- CI checks

## Phase 3 — Domain and D1

Implement:

- Customers
- Orders
- Order items
- State machine
- Delivery slots
- Capacity enforcement
- `applyChange()`
- Audit events
- Change feed
- Transactional outbox

Do not proceed until concurrency and rollback tests pass.

## Phase 4 — Offline frontend

Implement:

- IndexedDB
- Optimistic mutations
- Sync engine
- Conflict handling
- Snapshot recovery
- Multi-tab coordination
- Order-management UI

## Phase 5 — Queue infrastructure

Implement:

- Calendar Queue
- Notification Queue
- Outbox dispatcher
- Cron sweeper
- Retry policies
- DLQs
- Replay operations
- Monitoring

## Phase 6 — Google Calendar

Implement:

- Service-account authentication
- Event projection
- Incremental polling
- Manager rescheduling
- Echo suppression
- Forbidden-edit revert
- Sync-token recovery
- Reconciliation

## Phase 7 — Customer notifications

Implement:

- Delayed notification scheduling
- Relevance checks
- Provider integration
- Durable notification state
- Retries
- Deduplication
- Failure reporting

## Phase 8 — Production readiness

Implement and verify:

- Security hardening
- Load tests
- Failure injection
- Observability
- Alerts
- Runbooks
- Staging deployment
- Production deployment instructions

Do not deploy to production without explicit approval.

---

# 20. Research and verification requirements

Before relying on a platform capability, consult current official documentation.

At minimum, verify:

Cloudflare:

- D1 `batch()` atomicity
- SQLite trigger behaviour in D1
- D1 database limits and single-writer behaviour
- D1 `UPDATE ... RETURNING`
- D1 session consistency
- Queue delivery guarantees
- Queue retry and delay limits
- Dead-letter queues
- Cron Trigger behaviour
- Worker CPU and subrequest limits
- Worker service bindings
- Workers WebCrypto
- Workers test pool
- Cloudflare Workflows trade-offs

Google:

- Service-account OAuth authentication
- Calendar sharing and ownership
- Calendar event IDs
- Calendar API quotas
- Incremental sync tokens
- HTTP 410 recovery
- Conditional event updates
- Event deletion and restoration
- Calendar event private extended properties
- Calendar permissions and reminder behaviour

For every significant claim:

- Provide an official documentation URL.
- Record whether it was verified.
- Identify the version or date where relevant.
- Do not invent limits or guarantees.

If documentation cannot be accessed, explicitly mark the claim **UNVERIFIED** and stop before implementing a feature that depends on it.

---

# 21. Expected deliverables

Produce a working repository containing:

1. Cloudflare Worker applications.
2. D1 migrations.
3. Authentication and authorization.
4. Order management.
5. Delivery scheduling and capacity enforcement.
6. Offline-first frontend.
7. Transactional outbox.
8. Calendar and notification Queues.
9. Dead-letter handling.
10. Google Calendar synchronisation.
11. WhatsApp/SMS notification integration.
12. Cron-based recovery and reconciliation.
13. Automated tests.
14. CI configuration.
15. Deployment documentation.
16. Operational runbooks.
17. Architecture Decision Records.
18. Spec-kit documents.

At the end of each phase, report:

- Completed tasks
- Files created or modified
- Tests executed and results
- Remaining risks
- Unverified assumptions
- Next phase

Never claim that a test passed unless it was executed successfully.

Never claim that an integration works unless it was exercised against the appropriate environment.

---

# 22. Immediate instruction

**Begin with Phase 0 and Phase 1 only.**

Study the architecture, verify Cloudflare and Google platform assumptions, and produce the specification documents.

Do not implement application code yet.

Before proceeding to Phase 2, present:

1. Final proposed Worker topology.
2. D1 ownership and single-write-path design.
3. Transaction strategy for version and capacity conflicts.
4. Proposed D1 schema.
5. Authentication architecture.
6. Offline synchronisation contract.
7. Queue and Cron configuration.
8. Calendar echo-suppression and revert design.
9. Notification idempotency strategy.
10. Open business and technical decisions requiring approval.

Wait for explicit approval before continuing.