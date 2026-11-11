# Laundry ERP Constitution

**Status:** Approved Phase 1 specification on 2026-11-11.
**Approval record:** Phase 1 and the Stage A frontend scope were approved by the project owner on 2026-11-11. This approval does not by itself resolve open business decisions, finalise production migrations, or authorise a production deployment.
**Authority:** `prompts/master-prompt.md` overrides `docs/laundry-calendar-sync.md` wherever they conflict. Each deviation is recorded in `docs/adr/`.

This constitution defines immutable architecture and security rules. Changes require an explicit amendment and an ADR. Implementation plans and tasks must comply with every clause.

---

## 1. Cloudflare-only runtime

The system runs only on Cloudflare Workers, D1, Queues, Cron Triggers, Durable Objects only where justified, service bindings, Secrets, Workers Static Assets, Cloudflare observability, and browser IndexedDB.

Prohibited: Workers KV, PostgreSQL, MySQL, MongoDB, any external database, Redis, BullMQ, RabbitMQ, Kafka, external brokers, Node servers, VPS, Kubernetes, third-party sync engines, direct browser-to-Google Calendar calls, a separate manager-owned calendar, and a TV display module.

**Enforcement:** dependency review, Wrangler configuration review, architecture review, and tests that fail if prohibited bindings are configured.

## 2. Single D1 owner

Only the Laundry Worker holds the `LAUNDRY_DB` D1 binding. Gateway, Auth, Calendar, Notification, and Scheduler Workers must not access `LAUNDRY_DB` directly.

The Auth Worker may own a separate `AUTH_DB` for identity and sessions. That database is not an order source of truth.

**Enforcement:** binding matrix review and a repository check that only `workers/laundry/wrangler.jsonc` contains the laundry D1 binding.

## 3. Single write path

`applyChange()` is the only code that mutates authoritative order state. Every application, Calendar, webhook, and cron change goes through it.

Business intents are explicit verbs: `createOrder`, `reschedule`, `markProcessing`, `placeOnHold`, `releaseHold`, `markOutForDelivery`, `markDelivered`, and `cancel`. Arbitrary status patches are prohibited. The minimal status model and hold-comment rule are recorded in ADR-013.

**Enforcement:** domain-layer tests, code review, and a mutation-path check that no other module writes `orders`, `order_items`, or capacity-relevant state.

## 4. Atomic mutation

Every accepted mutation commits the canonical order change, `order_events`, `changes`, and required `outbox` rows in one `db.batch()`.

A zero-row conditional `UPDATE` is not a SQL error. The implementation must be fail-closed: dependent rows must be guarded so that a stale or rejected mutation cannot leave orphan audit, change-feed, outbox, or capacity rows.

**Enforcement:** D1 integration tests for stale writes, failed conditional updates, replay, and concurrent final-slot reservation.

## 5. Server-controlled versions

`orders.version` is server-owned and monotonically increasing. Clients submit `baseVersion`; a stale `baseVersion` is a conflict and must never silently overwrite newer state.

**Enforcement:** conflict tests for create, update, reschedule, and calendar-originated changes.

## 6. Idempotency

Every mutation carries a stable `mutationId`. Replaying a mutation must not create a duplicate transition, audit row, change-feed row, outbox row, Calendar event, or notification.

The same `mutationId` with a different payload must be rejected. Payload identity is verified with a canonical payload hash.

**Enforcement:** replay tests, payload-mismatch tests, and deterministic Google event ID tests.

## 7. Capacity is enforced transactionally

Delivery capacity is checked inside the same statement or transaction that mutates the order. No unprotected read-count-then-write is allowed. No client-side capacity check is authoritative.

Two concurrent mutations must not both reserve the final slot. Reschedule must release and acquire capacity atomically. Cancellation must release capacity. Capacity must never go negative or oversubscribe.

**Enforcement:** concurrent D1 integration tests, including simultaneous final-slot requests.

## 8. No external calls inside order transactions

Google Calendar and WhatsApp/SMS calls happen only after commit, through the transactional outbox and Queues.

`ctx.waitUntil()` dispatch is an optimisation, not durability. The committed outbox row is the durability guarantee.

**Enforcement:** code review, dependency boundaries, and queue recovery tests.

## 9. At-least-once delivery

Queues deliver at least once. Every consumer must be idempotent. Duplicate messages must not create duplicate Calendar events or duplicate notifications.

Consumers must re-read authoritative order state and must not trust stale message payloads as truth.

**Enforcement:** duplicate-message, out-of-order, consumer-crash, retry-exhaustion, and safe-replay tests.

## 10. Offline-first mutation semantics

The front desk may work offline using IndexedDB. Optimistic order state and its mutation must be written in one IndexedDB transaction.

Rejected and conflicting mutations must be preserved for user resolution; they must never be silently discarded. An offline order must never be reported as server-confirmed before the server accepts it.

**Enforcement:** browser tests for offline create/update, reload, eviction, multiple pending mutations, conflicts, and snapshot recovery.

## 11. Calendar permissions

The Google Calendar is not owned by the service account. A real Workspace user is the data owner; the service account is granted `writer` access through ACL.

Front desk access is read-only. A manager may move an event's start time only. Creating, deleting, cancelling, resizing, or modifying other fields is not an accepted business action. The application detects and reverts every other edit.

Calendar edits are not identity proof. The system must not attribute an event edit to a specific manager without reliable Google user attribution.

**Enforcement:** fake-Google classification tests, revert tests, and staging integration tests.

## 12. Tenant and hub isolation

Every business read and write is scoped by trusted tenant and hub context. Client-supplied `actor`, `role`, `source`, `tenantId`, or `hubId` values are never trusted.

**Enforcement:** authorization tests, cross-tenant access tests, and query review.

## 13. Observability and durable failures

The system records and alerts on pending outbox count and age, queue retries, Calendar DLQ depth, notification DLQ depth, sync-token resets, Calendar reverts, reconciliation drift, notification failures, mutation conflicts, offline pending mutations, and capacity rejections.

Permanently failing integrations must leave durable failure records and actionable alerts. Logs must never contain private keys, tokens, customer phone numbers, or message contents.

**Enforcement:** observability review, redaction tests, and runbook review.

## 14. Testing and approval gates

Tests must use deterministic clocks and fake external providers. Real Google and messaging integration tests run only when staging credentials are explicitly configured.

No production deploy, D1 schema finalisation, or authoritative write-path implementation may proceed without explicit approval. Phase 2 and later implementation require a separate approval after Phase 1 review.

**Enforcement:** phase-gate checklist, test evidence, and explicit approval records.


# FreshFold UI — Design System Constitution

## 1. Mandatory Design System

**FreshFold UI is the single source of truth for the entire application's visual design and reusable UI components.**

All frontend screens, existing and future, MUST use the FreshFold UI library.

The FreshFold dashboard is the canonical visual reference.

No feature or module may introduce an independent theme, component library or design language without explicit approval.

## 2. Design Tokens

The FreshFold UI library MUST centrally define the following semantic design tokens.

| Token | Value | Purpose |
|---|---|---|
| `primary` | `#2563EB` | Primary actions, active navigation, links |
| `primary-hover` | `#1D4ED8` | Hover and pressed actions |
| `canvas` | `#F7F9FD` | Application background |
| `surface` | `#FFFFFF` | Cards, forms, tables, dialogs |
| `text` | `#1E293B` | Primary text and headings |
| `text-muted` | `#64748B` | Secondary text and descriptions |
| `border` | `#E2E8F0` | Borders and separators |
| `success` | `#16A34A` | Completed, ready, successful |
| `warning` | `#D97706` | Pending, washing, attention |
| `danger` | `#DC2626` | Errors, destructive actions |

### Additional Tokens

- Font family: Inter, with system sans-serif fallback
- Small radius: 8px
- Medium radius: 10px
- Large radius: 16px
- Sidebar width: 220px
- Consistent spacing scale based on 4px increments
- Shared typography, shadows, focus indicators and responsive breakpoints

**Rules:**

- Components MUST reference semantic design tokens.
- Feature screens MUST NOT hardcode colors, font families, shadows or border radii.
- All design-token changes MUST be made in the FreshFold UI library.
- Token changes require visual regression testing across existing screens.

## 3. Reusable Component Library

FreshFold UI MUST provide reusable components in the following categories.

### Layout Components
- `AppShell`
- `Sidebar`
- `Topbar`
- `PageHeader`
- `PageContainer`

### General UI Components
- `Button`
- `Input`
- `Select`
- `DatePicker`
- `Card`
- `Badge`
- `StatusBadge`
- `DataTable`
- `Modal`
- `Alert`
- `Toast`
- `Tabs`
- `EmptyState`
- `LoadingState`
- `ConfirmDialog`

### Business Components
- `OrderCard`
- `OrderStatusBadge`
- `DeliverySlot`
- `CustomerCard`
- `SummaryCard`

Business components MUST be composed from FreshFold UI primitives.

## 4. Mandatory Component Reuse

Every new frontend feature MUST:

1. Import UI components from the FreshFold UI library.
2. Use the existing application shell and navigation.
3. Apply the same theme tokens as the dashboard.
4. Reuse existing components before creating new ones.
5. Add generally reusable components to the FreshFold UI library rather than duplicating them inside individual features.
6. Support responsive layouts and accessible keyboard navigation.
7. Use consistent loading, error, offline, empty and success states.

**Prohibited:**

- Hardcoded feature-level color palettes
- Separate styling systems for individual screens
- Duplicate implementations of shared components
- Introducing another UI component library without approval
- Replacing the FreshFold dashboard's visual language

## 5. Library Architecture

FreshFold UI MUST be implemented as an internal workspace package.

```text
packages/
  freshfold-ui/
    src/
      components/
        layout/
        primitives/
        feedback/
        data-display/
      styles/
        tokens.css
        globals.css
      index.ts
    package.json

apps/
  web/
    src/
      features/
        dashboard/
        orders/
        deliveries/
        customers/
```

The package MUST expose a stable public API.

Example:

```tsx
import {
  AppShell,
  PageHeader,
  Button,
  Card,
  StatusBadge,
  DataTable,
} from "@freshfold/ui";
```

Application features MUST consume the public API rather than importing internal library implementation files.

## 6. New Screen Development Contract

Before creating any new screen, the coding agent MUST:

1. Read this constitution.
2. Inspect the existing FreshFold UI component library.
3. Identify reusable components and design tokens.
4. Build the screen using those components.
5. Preserve the dashboard's established layout and styling.
6. Add missing generic components to the shared library when appropriate.
7. Validate desktop, tablet and mobile layouts.
8. Verify that no feature-specific theme has been introduced.

## 7. Technology and Hosting

- React + TypeScript
- Vite
- Tailwind CSS using FreshFold semantic design tokens
- Cloudflare Workers Static Assets
- Cloudflare Worker backend APIs
- IndexedDB for offline-first workflows

FreshFold UI is a frontend component library and MUST NOT depend on Cloudflare D1, Queues, Google Calendar or backend business logic.

## 8. Architectural Invariant

**Every screen must look and behave like part of the same FreshFold application, regardless of when or by whom it was developed.**

This rule applies to all future modules, including billing, inventory, staff management, reporting and settings.

## 9. FreshFold UI Enforcement Contract

FreshFold UI (`@freshfold/ui`) is the mandatory, versioned design-system library for all application screens.

### Design token ownership

- All semantic colors, typography, spacing, radii, shadows and responsive breakpoints MUST be defined centrally.
- Components MUST consume semantic tokens rather than hardcoded values.
- Feature modules MUST NOT define independent color palettes or duplicate global CSS rules.
- Tailwind utilities MUST use configured theme tokens for visual styling.

### Component ownership

- All shared layout, form, feedback, navigation and data-display components MUST reside in `packages/freshfold-ui`.
- Feature modules MUST import shared components through the `@freshfold/ui` public API.
- Feature-specific business components MAY remain inside their respective feature modules when they are not reusable.
- The UI package MUST remain independent of Cloudflare backend APIs and domain business logic.

### Visual consistency

Every new screen MUST use:

- The existing FreshFold `AppShell`.
- The same sidebar and top navigation patterns.
- Shared page headers and content spacing.
- Standard button variants, form controls and status indicators.
- Consistent loading, empty, error, offline and conflict states.

### Accessibility

- Interactive controls MUST support keyboard navigation.
- Forms MUST have accessible labels and validation feedback.
- Text and controls MUST meet WCAG 2.2 AA contrast requirements where applicable.
- Touch targets SHOULD be at least 44 × 44 CSS pixels, with documented exceptions.

### Automated enforcement

The project MUST include:

1. ESLint restrictions preventing feature-level imports from internal FreshFold UI paths.
2. Checks detecting hardcoded visual tokens outside the design-system package, with explicit exceptions for third-party integrations.
3. Component-level tests for shared UI behavior.
4. Visual regression tests for representative dashboard, order, delivery and customer screens.
5. Responsive tests for mobile, tablet and desktop layouts.

### Theme change control

Changes to global design tokens or shared components MUST be reviewed for their effect on existing screens.

No new screen may introduce a separate visual theme without an approved constitutional amendment.