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
- `pnpm dev:live` starts Auth, Laundry, Gateway, Notifications, and Scheduler, plus live Vite; Calendar starts only when Google credentials are configured
- `pnpm dev:<worker>` starts one Worker locally on its fixed port

## Frontend API modes

The web app defaults to the isolated mock adapter so the demo keeps working without a backend. For live data, run the local stack with `pnpm dev:live`; it starts Auth, Laundry, Gateway, Notifications, and Scheduler, starts Calendar when Google credentials are configured, and runs Vite in live mode. When Google is ready it also triggers an outbox sweep and calendar reconciliation. See `docs/runbooks/local-development.md` for ports and manual startup.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` uses `src/mocks/`; `live` uses the typed Gateway client in `src/api/`. |
| `VITE_API_BASE_URL` | empty (same origin) | Optional Gateway origin. Cookies still require a same-site deployment or proxy. |
| `VITE_API_TIMEOUT_MS` | `15000` | Per-request timeout; requests also accept caller aborts. |
| `VITE_REQUIRE_AUTH` | `false` | Mock mode only: requires the sample login screen before the demo. Live mode always requires a server session. |
| `VITE_ENABLE_DEMO_FALLBACKS` | `false` | Live mode only: uses clearly labelled sample delivery slots and service names because those read endpoints do not exist yet. |
| `VITE_SUPABASE_URL` | empty | Public Supabase project URL. When set with an anon key, the app uses Supabase Auth; otherwise it falls back to the local legacy Auth Worker. |
| `VITE_SUPABASE_ANON_KEY` | empty | Public anon key only. A service-role or `sb_secret_*` key is rejected at startup. |
| `VITE_SUPABASE_REDIRECT_URL` | empty | Password-reset and invitation redirect, normally `https://<host>/reset-password`. Configure the same URL in the Supabase project. |
| `VITE_GOOGLE_CALENDAR_EMBED_URL` | empty | Full Google Calendar iframe URL. Takes precedence over the calendar ID. |
| `VITE_GOOGLE_CALENDAR_ID` | committed in `apps/web/.env.development`; built-in production fallback | Builds the Google Calendar embed URL with `Asia/Kolkata`, week view, and title/print/tabs/calendars hidden. Override locally or for production via environment variable. |

Set either Google Calendar variable to show the calendar widget on the Dashboard and Calendar pages. When both are empty or the URL is invalid, the app shows setup guidance instead of an empty or broken iframe.

### Google Calendar delivery events

The dashboard iframe is only a view. Delivery orders are written to Google Calendar by the backend outbox and Calendar consumer, never directly by the browser. The iframe will stay empty until all of the following are true:

1. Enable the Google Calendar API and create a service account with a JSON key.
2. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` in `.dev.vars` for local development, or as Wrangler secrets for deployed Workers. Use the full PEM `private_key` from the service-account JSON key, including the BEGIN/END lines; a short placeholder or slug will leave Calendar sync disabled.
3. Share the target calendar with the service account as **Make changes to events** (writer).
4. Set `GOOGLE_CALENDAR_ID` to the same calendar used by the widget.
5. Run the Calendar Worker and Scheduler, or let `pnpm dev:live` start them when credentials are ready.

New orders enqueue calendar events after commit. Existing orders may need the reconciliation/backfill run; `pnpm dev:live` triggers it when Google is ready. The calendar must also be publicly embeddable for the dashboard iframe.

When the public Supabase values are configured, live mode signs in through Supabase Auth with PKCE, sends `Authorization: Bearer <access_token>` to Gateway `/api/*`, and bootstraps the server-owned role and hub from `GET /api/me`. Without them, local development falls back to the legacy Auth Worker (`POST /auth/login`, `GET /auth/session`, CSRF on writes, `POST /auth/logout`); staging and production disable that fallback. Roles always come from the server membership response, never client claims, and the mock role switch is hidden in live mode. See `docs/runbooks/supabase-auth.md` for redirect, staging/production isolation, session, and offline-cache rules.

### Validate Supabase Auth

Follow the [end-to-end validation checklist](docs/runbooks/supabase-auth.md#end-to-end-validation) to configure a Supabase project, seed a local employee membership, verify bearer authentication, run negative/JWKS/session checks, and validate staging before production approval. Never put a service-role key in the browser.

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
