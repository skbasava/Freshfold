# AGENTS.md — Laundry ERP

## Purpose and current state

This repository is a specification-first, Cloudflare-native Laundry ERP. **Do not assume application code, a working dashboard, the FreshFold UI package, migrations, or a build/test toolchain exists.** Inspect the repository before acting. References below to components or paths that do not yet exist are **implementation requirements**, not claims that they already exist.

The interface is for non-technical laundry staff: simple language, few steps, prominent actions, and a consistent blue-and-white FreshFold design.

## Authority and document resolution

1. An **approved** `specs/constitution.md` governs architectural and design invariants. Do not silently change it; request approval and document amendments in an ADR.
2. Approved ADRs and approved phase specifications govern implementation details, but cannot override the constitution without an approved amendment.
3. `prompts/master-prompt.md` supplies project requirements and phase instructions. Where it conflicts with `docs/laundry-calendar-sync.md`, the master prompt takes precedence **unless** an approved higher-authority document says otherwise. Record substantive deviations in an ADR.
4. `docs/laundry-calendar-sync.md` is the baseline architecture. Treat its unverified assumptions as questions to investigate, not settled facts.
5. `.opencode/commands/laundry-architect.md` is a command entry point, not an architectural authority.

**Bootstrap rule:** If `specs/constitution.md` is missing or still proposed, use the master prompt and architecture document to **draft** it during Phase 1. Do not treat a proposed constitution as approved. If a required source file is missing, report the missing file and request it rather than inventing its contents. Do not invent a resolution to conflicting approved requirements.

## Workflow and approval gates

- First perform **Phase 0**: inspect the repository and verify relevant Cloudflare/Google API assumptions against official documentation. Then perform **Phase 1**: produce/review `specs/constitution.md`, `specs/plan.md`, `specs/tasks.md`, proposed schema, write-path design, and ADRs. **No application implementation in these phases.**
- **Stop for explicit approval** before Phase 2, applying/finalizing D1 migrations, implementing the authoritative order write path, or deploying to production. Approval for one gate does not imply approval for another.
- Do not invent unresolved business rules, including slot capacity, business hours, cancellation/refund policies, notification channels, or offline acceptance semantics. Identify the decision and request approval when it affects implementation.
- At the end of each phase, report files created/changed, decisions, tests actually run, unresolved risks, and assumptions requiring verification.
- Do not claim a test, deployment, provider integration, or Cloudflare capability works unless verified in the appropriate environment.

## Cloudflare architecture invariants

- Use Cloudflare Workers, D1, Queues, Cron Triggers, service bindings, Secrets, Workers Static Asseets, and browser IndexedDB. Durable Objects require a documented justification. Do not add Workers KV, external databases, Redis, external brokers, Node servers, Kubernetes, or third-party sync engines.
- Use TypeScript. Planned tooling: Wrangler, Hono, Zod, Vitest and the Cloudflare Workers test pool; verify supported versions before installing.
- **D1 ownership:** only the Laundry Worker may bind `LAUNDRY_DB`. Other Workers interact through authenticated service bindings. A separate Auth Worker may use its own `AUTH_DB`, not as an order source of truth.
- **Order mutations:** `applyChange()` is the only authoritative order-state mutation path. Use explicit business intents; reject arbitrary status patches. Enforce trusted tenant/hub/actor context at the server boundary.
- **Atomic writes:** accepted changes must atomically update canonical order/capacity state, `order_events`, `changes`, and required `outbox` records. A conditional UPDATE affecting zero rows does **not** abort `db.batch()`. Prove a fail-closed rollback mechanism with D1 integration tests before implementation approval.
- **Concurrency:** enforce delivery-slot capacity on the server in the same atomic operation; never use an unprotected read-count-then-write. Rescheduling must release/acquire capacity atomically.
- **Idempotency:** require stable `mutationId`, canonical payload-hash validation, server-owned versions and `baseVersion` conflict checks. Consumers must handle at-least-once delivery and re-read canonical D1 state.
- **Side effects:** Google Calendar and customer notifications run after commit through a durable D1 outbox and Cloudflare Queues. `ctx.waitUntil()` is an optimization, not a durability guarantee. Use retries, DLQs, recovery and reconciliation.
- **Notification semantics:** keep a durable delivery ledger; do not promise exactly-once external delivery unless the provider offers a verified idempotency guarantee.
- **Calendar:** one Google Calendar; front desk is view-only. The only accepted manager-originated change is an event start-time move. Other edits must be detected and reverted; Google ACLs alone do not prevent them. Calendar edits are not reliable proof of editor identity.
- **Offline:** browser IndexedDB stores pending mutations and optimistic views atomically. Offline-created delivery slots are provisional until server acceptance. Preserve rejected/conflicting mutations for resolution; never label pending orders server-confirmed.
- Store canonical timestamps in UTC; evaluate delivery/business-time rules in `Asia/Kolkata`.

## Authentication

Follow the authentication architecture in `specs/constitution.md` §13 and
`docs/adr/ADR-014-supabase-auth.md`. Supabase Auth is the approved external staff identity provider. Phase B
implementation is authorized; production deployment remains separately gated.

Do not implement a parallel authentication system, run the Auth Worker or
`AUTH_DB` as a production identity source, store business records in Supabase,
or bypass Cloudflare Worker authorization.

Every protected feature must include authentication, authorization, and
cross-tenant/hub tests.

## FreshFold UI — mandatory design system

**FreshFold UI (`@freshfold/ui`) is the required internal workspace design-system package for every frontend screen.** The previously agreed simple dashboard design is the visual target, **not evidence of an existing implementation**. Build the package and reference dashboard after the relevant implementation phase is approved.

### Design tokens

Define these centrally in `packages/freshfold-ui/src/styles/tokens.css` and expose them through the Tailwind theme:

| Token | Value |
|---|---|
| `primary` | `#2563EB` |
| `primary-hover` | `#1D4ED8` |
| `canvas` | `#F7F9FD` |
| `surface` | `#FFFFFF` |
| `text` | `#1E293B` |
| `text-muted` | `#64748B` |
| `border` | `#E2E8F0` |
| `success` | `#16A34A` |
| `warning` | `#D97706` |
| `danger` | `#DC2626` |

Use Inter with a system sans-serif fallback, a 4px spacing scale, 8/10/16px radii, and a 220px desktop sidebar. Define typography, focus, shadows, and responsive tokens centrally. **Feature code must use semantic tokens**, not hardcoded visual values. Exceptions for third-party widgets or data visualization require a documented reason.

### Reusable component contract

- Shared layout: `AppShell`, `Sidebar`, `Topbar`, `PageHeader`, `PageContainer`.
- Controls: `Button`, `Input`, `Select`, `DatePicker`, `ConfirmDialog`.
- Display: `Card`, `Badge`, `StatusBadge`, `DataTable`, `Tabs`.
- Feedback: `Modal`, `Toast`, `Alert`, `EmptyState`, `LoadingState`.
- Business components such as `OrderCard`, `DeliverySlot`, `CustomerCard`, `SummaryCard` belong in `@freshfold/ui` **only if reusable across features**; otherwise keep them within their owning feature.
- Import shared components from the `@freshfold/ui` public API. Never deep-import private library files. Extend an existing component before duplicating it.
- FreshFold UI must not import backend business logic or Cloudflare bindings.

### UX and verification

- React + TypeScript + Vite + Tailwind CSS, hosted using Cloudflare Workers Static Assets.
- Preserve the same shell, navigation, page spacing, typography, status colors, and interaction patterns on every screen. Keep forms short and language understandable to laundry staff.
- Support desktop, tablet, and mobile; keyboard navigation, labeled inputs, visible focus, and WCAG 2.2 AA contrast where applicable.
- Use consistent loading, empty, error, offline, pending-sync, conflict, and success states.
- Test shared components and representative responsive screens. Add visual regression checks when the UI exists. Do not claim visual regression tests exist before configuring them.
- Global theme changes require impact review across existing screens; new themes or UI frameworks require explicit approval.

## Security, testing, and repository hygiene

- Never log or commit secrets, Google private keys, tokens, customer phone numbers, or message contents. Use placeholder-only `.dev.vars.example` files.
- Use deterministic clocks and fake external providers for automated tests; run real Google/messaging integration tests only with explicitly configured staging credentials.
- Add comments where they clarify security boundaries, concurrency, idempotency, or non-obvious decisions; avoid redundant commentary.
- Preserve existing `.opencode/` tooling and ignore rules unless an approved task requires a change.
- Inspect the repo before running build, test, or lint commands; do not assume scripts exist.

## Agent execution checklist

1. Inspect repository state and read the relevant governing documents.
2. Identify the current approved phase and unresolved decisions.
3. For UI work, check `@freshfold/ui` and its public API; if absent, plan its creation rather than assuming it exists.
4. Implement only work permitted by the current approval gate, with the smallest maintainable change.
5. Test applicable security, concurrency, offline, responsive, and accessibility behavior.
6. Report changed files, tests actually executed, failures, and decisions still awaiting approval.

**Invariant:** One Cloudflare-native architecture, one authoritative order write path, and one consistent FreshFold UI design system across all screens.
