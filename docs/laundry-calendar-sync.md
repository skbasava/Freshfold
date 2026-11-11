# Laundry Order & Delivery Sync: Architecture

Nov 11, 2026 · @Satish Kumar

## Scope and decisions

The system lets front-desk and manager staff run laundry orders from a web app. Cloudflare D1 is the only source of truth, and one Google Calendar projects delivery dates from it. The manager may reschedule deliveries by moving events in that calendar.

**Users:** the front desk uses the app and a view-only calendar. The laundry manager uses the app and may move events in the calendar. Customers are notified by WhatsApp or SMS, never by calendar.

**Decisions already made**

- D1 (SQLite on Cloudflare) is the system of record. Postgres is not used.
- Workers KV is dropped. There is no server-side cache.
- One Google Calendar, owned by a service account. The front desk is view-only. The manager can move or resize events only: no create, delete or cancel.
- The browser keeps IndexedDB as a disposable per-user replica plus a queue of pending mutations. The browser never calls Google Calendar.
- Every order change, from any source, goes through one server function, `applyChange()`.
- Calendar and customer messages are written by a server outbox (Cloudflare Queues, a Cron sweeper, and a dead-letter queue), after the D1 commit.
- The TV display is dropped.
- A third-party sync engine is not used. Instant was evaluated and rejected because its cloud shuts down on 31 August 2027. "Sync engine" in this document means our own client mutation queue and change-feed puller.

**Out of scope:** payments, pricing rules, and a driver or customer app.

## Approved control flow

Every change, from the browser or from the manager's calendar move, reaches D1 only through `applyChange()`. The calendar, the customer messages and IndexedDB are refreshed from that commit afterwards.

&#91;embedded content: control flow · 2 entry points, 1 write path, 3 projections\]

The left column is the frontend path and the right column is the calendar path. Both converge on `applyChange()` and one atomic D1 commit, which writes a change-feed row and an outbox row. The two outer lanes close the loop: the feed refreshes IndexedDB, and the outbox writes the Google event.

- **Frontend mutation:** IndexedDB → sync engine → `applyChange()` → D1 commit → change feed + outbox.
- **Manager calendar reschedule:** Google Calendar → Cron poller → `applyChange()` → D1 commit → change feed + outbox.
- **Downstream projections:** D1 outbox → Google Calendar + WhatsApp/SMS.
- **Client refresh:** D1 change feed → frontend IndexedDB.

**Two edges added to the approved flow**

1. **Echo suppression.** The outbox writes to Google Calendar and the poller reads it back. The `etag` of every outbox write is stored, and the poller skips events whose `etag` matches.
2. **Revert path.** A rejected reschedule, or a forbidden edit, never reaches `applyChange()`. The poller patches the event back in Google Calendar and adds the reason to its description.

## Invariants

These ten rules hold for every code path. A change that breaks one of them reintroduces the silent-failure modes this design exists to prevent.

1. **Single write path.** Only `applyChange()` writes `orders`. Frontend mutations, calendar reschedules, and any future payment webhook or cron job all call it.
2. **One atomic commit.** `applyChange()` writes `orders` (`version + 1`), `order_events`, `changes` and `outbox` in one `db.batch()`.
3. **Server version decides conflicts.** Conflicts are resolved by the order's `version`, never by client timestamps. A stale `baseVersion` returns 409 and the UI shows it. Nothing is silently overwritten.
4. **Idempotency.** The client's `mutationId` deduplicates inside `applyChange()`. The Google event ID is deterministic from the order ID, and a 409 on insert is treated as success followed by a patch.
5. **Outbox after commit only.** Google Calendar and WhatsApp/SMS are written only from committed D1 state, never inline in the request and never from the browser.
6. **Stale outbox work is skipped.** The consumer re-reads the order and skips the message if `synced_version >= version`.
7. **Customer messages are delayed and re-checked.** A message waits a few minutes and is dropped if the order's date is back to what the customer was last told.
8. **IndexedDB is a disposable replica.** It updates only from server responses and the change feed. Local rows are `pending`, `synced`, `rejected` or `conflict`, and the UI shows which.
9. **Calendar permissions.** The service account owns the calendar and is the only content writer. The manager may change event start times only, and every other edit is reverted. The front desk is view-only.
10. **One source of truth.** D1 wins every disagreement. The calendar and IndexedDB are projections or replicas, never sources.

## Data model

D1 holds seven tables and the browser holds three IndexedDB stores. D1 is SQLite, so timestamps are stored as ISO-8601 UTC text or epoch milliseconds, and `jsonb` becomes JSON text.

**D1 tables**

| Table | Key columns | Purpose |
| --- | --- | --- |
| `orders` | `id`, `customer_id`, `items` (JSON), `service`, `delivery_at`, `status`, `version`, `last_notified_delivery_at`, `updated_at` | Authoritative order state |
| `order_events` | `id`, `order_id`, `type`, `source` (`app` or `calendar`), `actor`, `at`, `detail`, `mutation_id` (unique) | Audit trail and mutation deduplication |
| `changes` | `id` (auto-increment), `order_id`, `version`, `op` (`upsert` or `delete`) | Change feed. `id` is the client cursor, and deletions appear as tombstones |
| `outbox` | `id`, `order_id`, `op`, `version`, `attempts`, `next_attempt_at`, `enqueued_at`, `done_at`, `last_error` | Pending side effects (Calendar, WhatsApp/SMS) |
| `calendar_sync` | `order_id` (primary key), `calendar_id`, `event_id`, `etag`, `synced_version`, `last_error`, `updated_at` | Maps an order to its Google event. `etag` is the echo-suppression key |
| `sync_state` | `calendar_id` (primary key), `sync_token`, `updated_at` | The poller's Google sync token |
| `customers` | `id`, `name`, `phone` | Customer reference, kept out of calendar events except ID and first name |

**IndexedDB stores (per user, disposable)**

| Store | Contents |
| --- | --- |
| `orders` | Orders whose delivery date is in the previous, current or next week, each with a local state: `pending`, `synced`, `rejected` or `conflict` |
| `mutations` | Queue of `{mutationId, orderId, intent, baseVersion, createdAt, attempts, status}` |
| `meta` | `cursor` (last applied `changes.id`) and `lastSyncedAt` |

**Rules for the local window**

- Membership is by delivery date. An order rescheduled out of the window is evicted, and one moved in is fetched.
- A search or lookup outside the window falls through to the server and never shows "not found".
- Clearing IndexedDB is always safe: the client rebuilds from cursor 0.

## applyChange()

`applyChange()` is the only function that writes `orders`. It validates a change, then commits the order, its audit row, a change-feed row and an outbox row in one atomic batch.

**Input:** `{ orderId, intent, payload, baseVersion, mutationId, source, actor }`, where `source` is `app` or `calendar`.

**Steps**

1. If `mutationId` already exists in `order_events`, return the stored result (idempotent replay).
2. Load the order. If `baseVersion` is older than `orders.version`, return 409 with the current order.
3. Validate the intent against the status state machine, business hours (`Asia/Kolkata`) and slot capacity. On failure return 422 with a reason. Nothing is written.
4. Run one `db.batch()` containing the statements below.
5. After commit, enqueue `{orderId, version}` to Queues with `ctx.waitUntil`. A Cron sweeper picks up any outbox row not enqueued.
6. Return the canonical order to the caller.

```sql
UPDATE orders SET delivery_at = ?, version = version + 1, updated_at = ?
 WHERE id = ? AND version = ?;            -- 0 rows changed = conflict
INSERT INTO order_events (order_id, type, source, actor, at, detail, mutation_id) VALUES (...);
INSERT INTO changes (order_id, version, op) VALUES (?, ?, 'upsert');
INSERT INTO outbox (order_id, op, version) VALUES (?, 'upsert', ?);
```

**Intents are verbs, not row overwrites:** `createOrder`, `reschedule`, `markPickedUp`, `markReady`, `markDelivered`, `cancel`. Each is validated against the state machine, so a late "delivered" cannot overwrite a "cancelled" order.

**To verify before build:** how D1 behaves with `AFTER UPDATE` triggers inside `batch()`. A trigger that writes `changes` and `outbox` would enforce invariant 1 in the database, but it needs a test first.

## Sequences

Four sequences cover every path. All of them reach D1 only through `applyChange()`.

**A. Frontend mutation**

1. The UI writes the optimistic order row (state `pending`) and a mutation record to IndexedDB in one transaction.
2. The client sync loop sends mutations to the Worker, in order per order, with `mutationId` and `baseVersion`.
3. The Worker calls `applyChange()`. On success it returns the canonical order. On 409 or 422 it returns the current order or the reason.
4. The client replaces its local row with the canonical one and clears the mutation. On rejection it marks the row `rejected` or `conflict` and shows the reason.
5. The outbox consumer (sequence C) writes the calendar event and sends the customer message.

**B. Manager reschedules in Google Calendar**

A Cron Trigger runs every minute. It calls `events.list` with the stored sync token and `showDeleted=true`, and matches events to orders by `extendedProperties.private.orderId` in code, because filters cannot be combined with a sync token (verify against the API reference). On HTTP 410 it drops the token, does a full list, and reconciles every order.

For each changed event whose `etag` differs from `calendar_sync.etag` (echo suppression):

| Detected change | Action |
| --- | --- |
| Start time moved, and valid | Call `applyChange({intent: 'reschedule', source: 'calendar', actor: 'manager', baseVersion})`. The outbox then rewrites the event and normalizes it |
| Start time moved, and invalid | No D1 write. Patch the event back and prepend `⚠ Reschedule rejected: <reason>` to its description |
| Event deleted | Restore it: patch `status=confirmed`, or re-insert with the same deterministic ID. Add `Delete not allowed, use the app` to the description |
| Event created with no `orderId` | Leave it, or patch the title with `⚠ Not an order`. Never delete the manager's event |
| Title, notes, color or duration changed | Revert from D1 |
| Recurrence added | Revert |

A reschedule is valid only if the event is timed (not all-day), the new start is in the future and in business hours, the order status allows a move (not `out_for_delivery`, `delivered` or `cancelled`), and the slot has capacity. Every revert uses `If-Match: <etag>`. A 412 means the manager changed the event again, so the poller refetches and re-evaluates.

**C. Outbox consumer**

1. Read the order and its `calendar_sync` row. Skip if `synced_version >= version`.
2. Upsert the Google event by deterministic ID. A 409 on insert counts as success, followed by a patch.
3. Store the returned `etag` and `synced_version` in `calendar_sync`, and mark the outbox row done.
4. On Google 429 or 5xx, retry through Queues with backoff. After `max_retries` the message goes to the dead-letter queue.
5. Customer notification is a separate delayed message. Before sending it, re-read the order and drop it if `version` changed or the date equals `last_notified_delivery_at`.

**D. Change feed pull**

1. The client calls `GET /changes?since=<cursor>` every 30 to 60 seconds, on tab focus, and after each of its own writes.
2. It applies upserts and tombstones to IndexedDB, evicts rows that left the window, and advances `cursor`.
3. If a pending local mutation exists for a row whose server version moved, the row is marked `conflict` and the mutation is kept until the server decides.
4. Only one tab runs the pull (Web Locks or BroadcastChannel election).

## Google Calendar event and permissions

One calendar holds one timed event per order, written only by the service account. The visible text stays minimal, and everything the sync needs sits in private extended properties.

| Field | Value |
| --- | --- |
| Event ID | Deterministic from the order ID (characters a-v and 0-9, 5 to 1024 long) |
| Title | `Deliver 5 PM · C-238 Rahul · ORD-1042` |
| Time | A timed event in `Asia/Kolkata` for the promised slot. An all-day event only if only a date is promised |
| Description | Service and item counts, for example `Wash and iron · 5 shirts, 3 trousers`, plus a link to the order in the app. The link uses an opaque ID, never the sequential order number |
| `extendedProperties.private` | `orderId` and `version`, which the poller and reconciliation job read and staff do not edit |
| Status | Optional `colorId`, only if someone updates order status in the app. The delivery time and slot are not repeated in the notes |
| Left out | Phone, address and full item detail stay in the app |

**Permissions**

- The service account owns the calendar and is the only writer of event content.
- The laundry manager has "make changes to events" and may only move or resize events. Google cannot enforce that limit, so the poller reverts everything else.
- The front desk has view-only access.
- Reminders are per user. Each person sets their own default reminder on the shared calendar once. A reminder override set by the service account fires only for that account, so it is not relied on.
- A nightly reconciliation job lists events by `orderId` and overwrites any that differ from D1.

## Conflicts and notifications

The higher server `version` wins every conflict, and the loser sees the reason. The most likely conflict is the manager moving an event while the front desk has an unsynced change on the same order.

| Situation | Result |
| --- | --- |
| Front desk has a pending mutation on order X, then the manager moves X first | The mutation's `baseVersion` is stale, so it gets a 409. The UI shows "Rescheduled by the manager. Re-apply your change?" |
| Manager's drag is based on an older version than D1 | The reschedule is rejected, the event is reverted, and a reason is added to its description |
| The feed delivers a newer version while a local mutation is pending | The local row becomes `conflict`. The mutation is kept until the server decides |
| Two reschedules within a second | The higher version wins. Only one customer message goes out, because messages are delayed and re-checked |
| Manager deletes an event | Treated as a forbidden action: the event is restored with a note |

**Customer notifications**

- They go through the same outbox, by WhatsApp or SMS. The calendar never contacts customers.
- Each message is queued with a delay of a few minutes. The consumer re-reads the order first and drops the message if the version changed or the delivery date equals `last_notified_delivery_at`. A drag and drag-back therefore never reaches the customer.
- Notification and delivery status is written back only at milestones, not every webhook, so per-order Calendar updates stay few.

## Failure modes, alerts and tests

Three asynchronous hops (outbox, Calendar, notification) can fail without anyone noticing, so every one needs an alert and a test before go-live.

**Failure modes**

| Failure | Effect | Mitigation |
| --- | --- | --- |
| Crash between D1 commit and enqueue | Order exists, no event | The outbox row stays pending and the Cron sweeper re-enqueues it |
| Google 429 or 5xx | Event late | Queue retry with backoff, then dead-letter queue. Orders keep working |
| Duplicate queue delivery | Duplicate event or message | Deterministic event ID, `synced_version` check, re-checked notification |
| Sync token invalidated (HTTP 410) | Manager changes missed | Full list plus reconciliation of every order |
| Poller sees its own write | False "manager reschedule" | Skip events whose `etag` matches the stored one |
| IndexedDB cleared or evicted | Local data gone | Rebuild from cursor 0. Pending mutations are the only data at risk, so show an unsynced counter |
| Browser tab closed with pending mutations | Change not yet saved | Warn on close, and keep the pending window short |

**Alerts**

- Outbox rows older than about 5 minutes.
- Dead-letter queue depth above zero. The queue needs a consumer, or it only stores failures.
- Sync-token resets (410).
- Reverts per day above a threshold, which suggests the manager is fighting the rules.

**Tests before go-live**

1. Kill the Worker between commit and enqueue, and confirm the sweeper creates the event.
2. Force Google 429 for several minutes, and confirm order entry keeps working and the event catches up.
3. Deliver the same queue message twice, and confirm one event and one customer message.
4. Race a manager drag against a front-desk edit, and confirm the higher version wins everywhere.
5. Clear IndexedDB on a client, and confirm it rebuilds from cursor 0.
6. Drag across days, to the past, to an all-day slot, and resize an event, and confirm each is validated or reverted.
7. Delete an event, then undo it in the Google UI.
8. Confirm the poller never treats its own outbox writes as a manager reschedule.

## Unverified assumptions and open decisions

One open decision can remove a large part of this design: whether the front desk must keep taking orders while the internet is down. If not, the mutation queue and offline writes can be dropped for server-first writes with IndexedDB as a read cache only.

| Item | Why it matters | How to settle it |
| --- | --- | --- |
| Must the front desk work offline? | Decides whether the IndexedDB mutation queue is built | Ask the business, and check how often the office loses internet |
| Daily order volume and busiest-day peak | Sizes Calendar writes, polling load and slot capacity | Get a figure from the business |
| Google Calendar API quotas | Per-user and per-project limits affect burst writes and the poller | Check the current quota page before sizing |
| Sync token with filters | The design matches events by `orderId` in code, assuming filters cannot be combined with a sync token | Check the `events.list` reference |
| Webhook callback requirements | Webhooks need domain verification and channel renewal. Polling avoids both | Keep polling unless the delay matters |
| Per-user reminders on a shared calendar | The design assumes each person sets their own default | Test on a throwaway calendar |
| D1 triggers inside `batch()` | Would enforce the single write path in the database | Test before relying on it |
| Browser storage persistence | Browsers can evict IndexedDB, and iOS Safari is stricter for sites not installed to the home screen | Request persistent storage, and test on the real devices |
| Customer channel habits | The design assumes WhatsApp or SMS is the expected channel | Ask customers or the business |
| Slot capacity and business hours rules | Reschedule validation depends on them | Business to define |
| Who may cancel an order, and refund rules | Cancel is an app-only intent, and paid orders may need confirmation | Business to define |
| Cloudflare Workflows | Might replace Queues plus Cron for retry logic more cleanly. Not researched | Evaluate before build |
| DPDP Act implications of customer data in Google | Names and order summaries sit in a Workspace calendar | Legal review. This document is not legal advice |
