# Laundry ERP

Cloudflare-native Laundry ERP. The Workers, D1 schema, authoritative `applyChange()` write path, outbox/queues, Calendar projection/polling/reconciliation, notification suppression, offline sync layer, observability, and runbooks are implemented and covered by local tests.

**Production status:** not production-ready and not approved for deployment. See `docs/runbooks/production-readiness.md` for blockers, gates, open decisions, and rollout requirements. Stage A added the FreshFold UI package and a mock-backed Dashboard; Stage B added the Orders, Deliveries and Customers screens; Stage C adds the typed Gateway client, login/session UX, live-vs-mock adapter switch, and offline queue integration. Deployment approval, staging verification, and the missing backend endpoints (delivery-slot listing, customer writes, customer order history) remain outstanding.

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

- `pnpm typecheck` type-checks packages, tests, the web app, and each Worker
- `pnpm test` runs Vitest in the Workers runtime
- `pnpm test:web` runs the jsdom + Testing Library web suite
- `pnpm build:web` builds `apps/web/dist` for the Gateway static assets
- `pnpm dev:web` starts the Vite development server with mock data
- `pnpm dev:live` starts Auth, Laundry, Gateway, and live Vite
- `pnpm dev:<worker>` starts one Worker locally on its fixed port

## Frontend API modes

The web app defaults to the isolated mock adapter so the demo keeps working without a backend. For live data, run the local stack with `pnpm dev:live`; it starts Auth, Laundry, Gateway, and Vite in live mode. See `docs/runbooks/local-development.md` for ports and manual startup.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` uses `src/mocks/`; `live` uses the typed Gateway client in `src/api/`. |
| `VITE_API_BASE_URL` | empty (same origin) | Optional Gateway origin. Cookies still require a same-site deployment or proxy. |
| `VITE_API_TIMEOUT_MS` | `15000` | Per-request timeout; requests also accept caller aborts. |
| `VITE_REQUIRE_AUTH` | `false` | Mock mode only: requires the sample login screen before the demo. Live mode always requires a server session. |
| `VITE_ENABLE_DEMO_FALLBACKS` | `false` | Live mode only: uses clearly labelled sample delivery slots and service names because those read endpoints do not exist yet. |

Live mode authenticates through `POST /auth/login`, bootstraps with `GET /auth/session`, sends `x-csrf-token` on writes, and logs out through `POST /auth/logout`. Roles always come from the server session; the mock role switch is hidden in live mode.

Missing backend endpoints stay isolated:

- delivery-slot listing and service catalogue: empty by default, or explicit demo fallback when enabled;
- customer create/update: not implemented;
- customer order history: composed from the existing hub-scoped order list and labelled as a fallback.

## Deploy to Cloudflare

The deploy script validates the workspace, builds the frontend, applies remote D1 migrations, and deploys the internal Workers before the Gateway.

```bash
pnpm deploy:cloudflare staging
pnpm deploy:cloudflare staging --dry-run
```

Production deployment requires explicit approval and a separate confirmation:

```bash
CONFIRM_PRODUCTION=DEPLOY_PRODUCTION pnpm deploy:cloudflare production
```

Before deploying:

- Authenticate Wrangler with `pnpm exec wrangler login` and confirm with `pnpm exec wrangler whoami`.
- Replace the placeholder D1 `database_id` values in the auth and Laundry Wrangler configs. The script refuses to deploy while either remains `00000000-0000-0000-0000-000000000000`.
- Use environment-specific `workers/<worker>/wrangler.<environment>.jsonc` files when they exist; otherwise the script uses `workers/<worker>/wrangler.jsonc`.
- Set `GATEWAY_HEALTH_URL` to run an optional post-deploy health check.

The script runs `pnpm check` and `pnpm build:web` unless `--skip-checks` is passed. It deploys auth, Laundry, Calendar, Notifications, and Scheduler first, then the Gateway. It never deploys to production without `CONFIRM_PRODUCTION=DEPLOY_PRODUCTION`.

## Layout

- `apps/web` React + TypeScript + Vite + Tailwind frontend; typed Gateway client in `src/api/`, mock adapter in `src/mocks/`
- `packages/freshfold-ui` mandatory `@freshfold/ui` design-system package
- `workers/<name>` Worker entry points and Wrangler config
- `packages/*` shared TypeScript packages
- `specs/*` constitution, plan, and task register
- `docs/*` architecture, ADRs, and runbooks

## Runbooks

See `docs/runbooks/README.md` for the operational runbook index, including observability and alert thresholds, queue/DLQ recovery, Google and messaging outages, secret rotation, staging-to-production promotion, and the `production-readiness.md` review (not an approval).
