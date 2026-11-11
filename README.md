# Laundry ERP

Cloudflare-native Laundry ERP. The Workers, D1 schema, authoritative `applyChange()` write path, outbox/queues, Calendar projection/polling/reconciliation, notification suppression, offline sync layer, observability, and runbooks are implemented and covered by local tests.

**Production status:** not production-ready and not approved for deployment. See `docs/runbooks/production-readiness.md` for blockers, gates, open decisions, and rollout requirements. The FreshFold UI package and dashboard screens are not implemented; `apps/web/public` is still a scaffold.

## Prerequisites

- Node.js 22+
- pnpm 10.32.1

## Setup

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm check
```

## Scripts

- `pnpm typecheck` type-checks packages, tests, and each Worker
- `pnpm test` runs Vitest in the Workers runtime
- `pnpm dev:<worker>` starts a Worker locally

## Layout

- `apps/web/public` static frontend assets
- `workers/<name>` Worker entry points and Wrangler config
- `packages/*` shared TypeScript packages
- `specs/*` constitution, plan, and task register
- `docs/*` architecture, ADRs, and runbooks

## Runbooks

See `docs/runbooks/README.md` for the operational runbook index, including observability and alert thresholds, queue/DLQ recovery, Google and messaging outages, secret rotation, staging-to-production promotion, and the `production-readiness.md` review (not an approval).
